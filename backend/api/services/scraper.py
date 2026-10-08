import ipaddress
import logging
import os
import socket
import ssl
import time
from urllib.parse import urlsplit, urlunsplit
from urllib.request import getproxies, proxy_bypass

import httpx
from bs4 import BeautifulSoup

from ..exceptions import ScrapeError

logger = logging.getLogger(__name__)

# don't send a whole book to the AI, this is enough for a summary
MAX_TEXT_LENGTH = 15000
# stop downloading after this many bytes so a huge file can't eat the server's memory
MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 5
MAX_URL_LENGTH = 2000
ALLOWED_PORTS = {None, 80, 443, 8080, 8443}
TIMEOUT = httpx.Timeout(15, connect=8)
# httpx timeouts are per step (connect, each read...), so a slow site with
# redirects could take minutes. This caps the whole download.
TOTAL_TIME_LIMIT = 30
# tests swap this for a fake transport
TRANSPORT = None

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    "Accept-Language": "en-US,en;q=0.8",
}

# tags that are almost never part of the main content
JUNK_TAGS = ["script", "style", "noscript", "iframe", "svg", "canvas", "form",
             "nav", "header", "footer", "aside", "button", "template", "dialog"]


def validate_url(url):
    """Basic checks on the url itself, before we touch the network."""
    if len(url) > MAX_URL_LENGTH:
        raise ScrapeError("That URL is too long", code="invalid_url")

    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise ScrapeError("That doesn't look like a valid URL", code="invalid_url") from None

    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ScrapeError("Only http:// and https:// links are supported", code="invalid_url")
    if parts.username or parts.password:
        raise ScrapeError("URLs with a username or password are not allowed", code="invalid_url")
    if port not in ALLOWED_PORTS:
        raise ScrapeError(f"Port {port} is not allowed, use a normal website address", code="invalid_url")
    return parts


def resolve_public_ip(hostname):
    """
    Look up the host and make sure it's a public internet address.
    This stops people from using the server to reach localhost, the cloud
    metadata endpoint (169.254.169.254) or other internal machines.
    """
    try:
        infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError):
        raise ScrapeError(f"Could not find the website '{hostname}'. Check the spelling.", 422, "dns_not_found") from None

    ips = []
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if ip.version == 6 and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if not ip.is_global or ip.is_multicast:
            logger.warning("Blocked non-public address %s for host %s", ip, hostname)
            raise ScrapeError("That address points to a private or local network, which isn't allowed", code="private_address")
        ips.append(ip)

    if not ips:
        raise ScrapeError(f"Could not find the website '{hostname}'", 422, "dns_not_found")
    return ips[0]


def uses_proxy(parts):
    proxies = getproxies()
    return bool(proxies.get(parts.scheme) or proxies.get("all")) and not proxy_bypass(parts.hostname)


def build_request(clients, url):
    """
    Connect to the ip we already checked instead of letting httpx look up the
    host again. Otherwise a DNS server could answer with a public ip for the
    check and a private one for the real request (DNS rebinding).
    Returns (client, request).
    """
    parts = validate_url(url)
    ip = resolve_public_ip(parts.hostname)

    if uses_proxy(parts):
        # behind an http proxy the proxy does the dns lookup, so we can't pin
        # the ip ourselves (proxies usually refuse raw ips anyway)
        client = clients["proxy"]
        return client, client.build_request("GET", url)

    client = clients["direct"]

    ip_host = f"[{ip}]" if ip.version == 6 else str(ip)
    netloc = f"{ip_host}:{parts.port}" if parts.port else ip_host
    pinned_url = urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))

    host_header = parts.hostname if not parts.port else f"{parts.hostname}:{parts.port}"
    request = client.build_request("GET", pinned_url, headers={"Host": host_header})
    if parts.scheme == "https":
        # so TLS still checks the certificate against the real hostname
        request.extensions["sni_hostname"] = parts.hostname
    return client, request


def read_limited(response, deadline):
    chunks = []
    total = 0
    for chunk in response.iter_bytes():
        if time.monotonic() > deadline:
            raise ScrapeError("The website is sending the page too slowly", 504, "site_timeout")
        room = MAX_DOWNLOAD_BYTES - total
        if len(chunk) >= room:
            # keep what fits and stop, don't throw the whole chunk away
            chunks.append(chunk[:room])
            logger.debug("Page is bigger than %d bytes, cutting it off", MAX_DOWNLOAD_BYTES)
            break
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks)


def fetch_html(url):
    logger.debug("Fetching %s", url)
    deadline = time.monotonic() + TOTAL_TIME_LIMIT

    try:
        options = {"headers": HEADERS, "timeout": TIMEOUT, "follow_redirects": False, "transport": TRANSPORT}
        # trust_env=False: the pinned request must go straight to the ip, not through a proxy.
        # that also turns off SSL_CERT_FILE, so pass a custom CA bundle in ourselves
        ca_file = os.getenv("SSL_CERT_FILE")
        verify = ssl.create_default_context(cafile=ca_file) if ca_file else True
        with httpx.Client(trust_env=False, verify=verify, **options) as direct, httpx.Client(**options) as proxy:
            clients = {"direct": direct, "proxy": proxy}
            for _ in range(MAX_REDIRECTS + 1):
                if time.monotonic() > deadline:
                    raise ScrapeError("The website took too long to respond", 504, "site_timeout")
                client, request = build_request(clients, url)
                response = client.send(request, stream=True)
                try:
                    if response.is_redirect:
                        location = response.headers.get("location", "")
                        url = str(httpx.URL(url).join(location))
                        logger.debug("Redirected to %s", url)
                        continue

                    content_type = response.headers.get("content-type", "").lower()
                    logger.debug("Got status=%s content-type=%s", response.status_code, content_type)

                    if response.status_code in (401, 403):
                        raise ScrapeError(
                            "This website blocked our request (it doesn't allow scrapers or needs a login)", 422, "site_blocked"
                        )
                    if response.status_code == 404:
                        raise ScrapeError("That page doesn't exist (404). Check the URL.", 422, "page_not_found")
                    if response.status_code == 429:
                        raise ScrapeError("The website is rate limiting us. Try again in a bit.", 422, "site_rate_limited")
                    if response.status_code >= 400:
                        raise ScrapeError(f"The website returned an error (HTTP {response.status_code})", 502, "site_error")
                    if content_type and "html" not in content_type:
                        kind = content_type.split(";")[0]
                        raise ScrapeError(f"That link is not a web page (it's {kind}). Only HTML pages are supported.", 415, "not_html")

                    return read_limited(response, deadline), response.charset_encoding, url
                finally:
                    response.close()
    except httpx.TimeoutException:
        raise ScrapeError("The website took too long to respond", 504, "site_timeout") from None
    except httpx.HTTPError as e:
        logger.debug("Request to %s failed: %r", url, e)
        raise ScrapeError("Could not connect to the website. It may be down or blocking us.", 502, "site_unreachable") from None

    raise ScrapeError("The page redirected too many times", 502, "too_many_redirects")


def clean(text):
    return " ".join(text.split())


def extract_text(html, encoding=None):
    soup = BeautifulSoup(html, "html.parser", from_encoding=encoding if isinstance(html, bytes) else None)

    title = ""
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = clean(og_title["content"])
    elif soup.title:
        title = clean(soup.title.get_text())

    for tag in soup(JUNK_TAGS):
        tag.decompose()

    # most blogs / news sites put the content in <article> or <main>
    content = soup.find("article") or soup.find("main") or soup.body or soup

    lines = []
    seen = set()
    for el in content.find_all(["h1", "h2", "h3", "h4", "p", "li", "blockquote", "pre", "td"]):
        text = clean(el.get_text(" "))
        if len(text) > 1 and text not in seen:
            seen.add(text)
            lines.append(text)
    text = "\n".join(lines)

    # some sites only use divs, so just grab all the text in that case
    if len(text) < 200:
        logger.debug("Not many text tags found, falling back to all text")
        text = clean(content.get_text(" "))

    return title[:300], text


def scrape_page(url):
    html, encoding, final_url = fetch_html(url)
    title, text = extract_text(html, encoding)
    logger.debug("Title=%r, extracted %d chars", title, len(text))

    if len(text) < 50:
        raise ScrapeError(
            "Couldn't find readable text on that page. It probably loads its content with JavaScript.",
            422,
            "no_text",
        )

    return {
        "title": title or urlsplit(final_url).hostname,
        "url": final_url,
        "text": text[:MAX_TEXT_LENGTH],
        "char_count": len(text),
        "word_count": len(text.split()),
        "truncated": len(text) > MAX_TEXT_LENGTH,
    }
