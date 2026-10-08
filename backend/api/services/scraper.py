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
from django.conf import settings

from ..exceptions import ScrapeError

logger = logging.getLogger(__name__)

TRANSPORT = None


def validate_url(url):
    if len(url) > settings.SCRAPER_MAX_URL_LENGTH:
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
    if port is not None and port not in settings.SCRAPER_ALLOWED_PORTS:
        raise ScrapeError(f"Port {port} is not allowed, use a normal website address", code="invalid_url")
    return parts


def resolve_public_ip(hostname):
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
    parts = validate_url(url)
    ip = resolve_public_ip(parts.hostname)

    if uses_proxy(parts):
        client = clients["proxy"]
        return client, client.build_request("GET", url)

    client = clients["direct"]

    ip_host = f"[{ip}]" if ip.version == 6 else str(ip)
    netloc = f"{ip_host}:{parts.port}" if parts.port else ip_host
    pinned_url = urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))

    host_header = parts.hostname if not parts.port else f"{parts.hostname}:{parts.port}"
    request = client.build_request("GET", pinned_url, headers={"Host": host_header})
    if parts.scheme == "https":
        request.extensions["sni_hostname"] = parts.hostname
    return client, request


def no_check():
    return None


def read_limited(response, deadline, check_cancelled=no_check):
    limit = settings.SCRAPER_MAX_DOWNLOAD_BYTES
    chunks = []
    total = 0
    for chunk in response.iter_bytes():
        check_cancelled()
        if time.monotonic() > deadline:
            raise ScrapeError("The website is sending the page too slowly", 504, "site_timeout")
        room = limit - total
        if len(chunk) >= room:
            chunks.append(chunk[:room])
            logger.debug("Page is bigger than %d bytes, cutting it off", limit)
            break
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks)


def check_response(response):
    status = response.status_code
    content_type = response.headers.get("content-type", "").lower()
    logger.debug("Got status=%s content-type=%s", status, content_type)

    if status in (401, 403):
        raise ScrapeError("This website blocked our request (it doesn't allow scrapers or needs a login)", 422, "site_blocked")
    if status == 404:
        raise ScrapeError("That page doesn't exist (404). Check the URL.", 422, "page_not_found")
    if status == 429:
        raise ScrapeError("The website is rate limiting us. Try again in a bit.", 422, "site_rate_limited")
    if status >= 400:
        raise ScrapeError(f"The website returned an error (HTTP {status})", 502, "site_error")
    if content_type and "html" not in content_type:
        kind = content_type.split(";")[0]
        raise ScrapeError(f"That link is not a web page (it's {kind}). Only HTML pages are supported.", 415, "not_html")


def http_clients():
    options = {
        "headers": {
            "User-Agent": settings.SCRAPER_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
            "Accept-Language": "en-US,en;q=0.8",
        },
        "timeout": httpx.Timeout(settings.SCRAPER_TIMEOUT, connect=settings.SCRAPER_CONNECT_TIMEOUT),
        "follow_redirects": False,
        "transport": TRANSPORT,
    }
    ca_file = os.getenv("SSL_CERT_FILE")
    verify = ssl.create_default_context(cafile=ca_file) if ca_file else True
    return httpx.Client(trust_env=False, verify=verify, **options), httpx.Client(**options)


def fetch_html(url, check_cancelled=no_check):
    logger.debug("Fetching %s", url)
    deadline = time.monotonic() + settings.SCRAPER_TOTAL_TIME_LIMIT

    try:
        direct, proxy = http_clients()
        with direct, proxy:
            clients = {"direct": direct, "proxy": proxy}
            for _ in range(settings.SCRAPER_MAX_REDIRECTS + 1):
                check_cancelled()
                if time.monotonic() > deadline:
                    raise ScrapeError("The website took too long to respond", 504, "site_timeout")
                client, request = build_request(clients, url)
                response = client.send(request, stream=True)
                try:
                    if response.is_redirect:
                        url = str(httpx.URL(url).join(response.headers.get("location", "")))
                        logger.debug("Redirected to %s", url)
                        continue
                    check_response(response)
                    return read_limited(response, deadline, check_cancelled), response.charset_encoding, url
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
    soup = BeautifulSoup(html, settings.SCRAPER_HTML_PARSER, from_encoding=encoding if isinstance(html, bytes) else None)

    title = ""
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = clean(og_title["content"])
    elif soup.title:
        title = clean(soup.title.get_text())

    for tag in soup(settings.SCRAPER_IGNORED_TAGS):
        tag.decompose()

    content = soup.find("article") or soup.find("main") or soup.body or soup

    lines = []
    seen = set()
    for el in content.find_all(settings.SCRAPER_TEXT_TAGS):
        text = clean(el.get_text(" "))
        if len(text) > 1 and text not in seen:
            seen.add(text)
            lines.append(text)
    text = "\n".join(lines)

    if len(text) < settings.SCRAPER_FALLBACK_MIN_CHARS:
        logger.debug("Not many text tags found, falling back to all text")
        text = clean(content.get_text(" "))

    return title[: settings.SCRAPER_MAX_TITLE_CHARS], text


def scrape_page(url, check_cancelled=no_check):
    html, encoding, final_url = fetch_html(url, check_cancelled)
    title, text = extract_text(html, encoding)
    logger.debug("Title=%r, extracted %d chars", title, len(text))

    if len(text) < settings.SCRAPER_MIN_TEXT_CHARS:
        raise ScrapeError(
            "Couldn't find readable text on that page. It probably loads its content with JavaScript.",
            422,
            "no_text",
        )

    limit = settings.SCRAPER_MAX_TEXT_CHARS
    return {
        "title": title or urlsplit(final_url).hostname,
        "url": final_url,
        "text": text[:limit],
        "char_count": len(text),
        "word_count": len(text.split()),
        "truncated": len(text) > limit,
    }
