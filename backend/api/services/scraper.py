import ipaddress
import logging
import os
import socket
import ssl
import time
from urllib.parse import urlsplit, urlunsplit
from urllib.request import getproxies, proxy_bypass

import httpx
from django.conf import settings

from ..exceptions import ScrapeError
from . import browser, extractors

logger = logging.getLogger(__name__)

TRANSPORT = None


def validate_url(url):
    if len(url) > settings.SCRAPER_MAX_URL_LENGTH:
        raise ScrapeError("That link is too long.", code="invalid_url")

    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise ScrapeError("That doesn't look like a valid link.", code="invalid_url") from None

    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ScrapeError("Only web links (http or https) can be summarized.", code="invalid_url")
    if parts.username or parts.password:
        raise ScrapeError("Links with a username or password can't be used.", code="invalid_url")
    if port is not None and port not in settings.SCRAPER_ALLOWED_PORTS:
        raise ScrapeError("That port isn't allowed. Use a normal website link.", code="invalid_url")
    return parts


def resolve_public_ip(hostname):
    try:
        infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError):
        raise ScrapeError(f"We couldn't find {hostname}. Check the spelling.", 422, "dns_not_found") from None

    ips = []
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if ip.version == 6 and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if not ip.is_global or ip.is_multicast:
            logger.warning("Blocked non-public address %s for host %s", ip, hostname)
            raise ScrapeError("Links to private or local networks can't be summarized.", code="private_address")
        ips.append(ip)

    if not ips:
        raise ScrapeError(f"We couldn't find {hostname}. Check the spelling.", 422, "dns_not_found")
    return ips[0]


def precheck_url(url):
    parts = validate_url(url)
    resolve_public_ip(parts.hostname)


def uses_proxy(parts):
    proxies = getproxies()
    return bool(proxies.get(parts.scheme) or proxies.get("all")) and not proxy_bypass(parts.hostname)


def build_request(clients, url, method="GET", headers=None, content=None):
    parts = validate_url(url)
    ip = resolve_public_ip(parts.hostname)
    headers = dict(headers or {})

    if uses_proxy(parts):
        client = clients["proxy"]
        return client, client.build_request(method, url, headers=headers, content=content)

    client = clients["direct"]

    ip_host = f"[{ip}]" if ip.version == 6 else str(ip)
    netloc = f"{ip_host}:{parts.port}" if parts.port else ip_host
    pinned_url = urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))

    headers["Host"] = parts.hostname if not parts.port else f"{parts.hostname}:{parts.port}"
    request = client.build_request(method, pinned_url, headers=headers, content=content)
    if parts.scheme == "https":
        request.extensions["sni_hostname"] = parts.hostname
    return client, request


def no_check():
    return None


def read_limited(response, deadline, check_cancelled=no_check, limit=None):
    limit = limit or settings.SCRAPER_MAX_DOWNLOAD_BYTES
    chunks = []
    total = 0
    for chunk in response.iter_bytes():
        check_cancelled()
        if time.monotonic() > deadline:
            raise ScrapeError("The website is responding too slowly.", 504, "site_timeout")
        room = limit - total
        if len(chunk) >= room:
            chunks.append(chunk[:room])
            logger.debug("Download is bigger than %d bytes, cutting it off", limit)
            return b"".join(chunks), True
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks), False


def check_response(response):
    status = response.status_code
    logger.debug("Got status=%s content-type=%s", status, response.headers.get("content-type", ""))

    if status in (401, 403):
        raise ScrapeError("This website doesn't allow automated reading.", 422, "site_blocked")
    if status == 404:
        raise ScrapeError("That page doesn't exist. Check the link.", 422, "page_not_found")
    if status == 429:
        raise ScrapeError("This website is limiting visits right now. Try again in a bit.", 422, "site_rate_limited")
    if status >= 400:
        raise ScrapeError("The website had a problem. Try again later.", 502, "site_error")


def http_clients():
    options = {
        "headers": {
            "User-Agent": settings.SCRAPER_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.8",
        },
        "timeout": httpx.Timeout(settings.SCRAPER_TIMEOUT, connect=settings.SCRAPER_CONNECT_TIMEOUT),
        "follow_redirects": False,
        "transport": TRANSPORT,
    }
    ca_file = os.getenv("SSL_CERT_FILE")
    verify = ssl.create_default_context(cafile=ca_file) if ca_file else True
    return httpx.Client(trust_env=False, verify=verify, **options), httpx.Client(**options)


def fetch(url, check_cancelled=no_check):
    logger.debug("Fetching %s", url)
    deadline = time.monotonic() + settings.SCRAPER_TOTAL_TIME_LIMIT

    try:
        direct, proxy = http_clients()
        with direct, proxy:
            clients = {"direct": direct, "proxy": proxy}
            for _ in range(settings.SCRAPER_MAX_REDIRECTS + 1):
                check_cancelled()
                if time.monotonic() > deadline:
                    raise ScrapeError("The website took too long to respond.", 504, "site_timeout")
                client, request = build_request(clients, url)
                response = client.send(request, stream=True)
                try:
                    if response.is_redirect:
                        url = str(httpx.URL(url).join(response.headers.get("location", "")))
                        logger.debug("Redirected to %s", url)
                        continue
                    check_response(response)
                    body, truncated = read_limited(response, deadline, check_cancelled)
                    return {
                        "body": body,
                        "truncated": truncated,
                        "content_type": response.headers.get("content-type", ""),
                        "charset": response.charset_encoding,
                        "url": url,
                    }
                finally:
                    response.close()
    except httpx.TimeoutException:
        raise ScrapeError("The website took too long to respond.", 504, "site_timeout") from None
    except httpx.HTTPError as e:
        logger.debug("Request to %s failed: %r", url, e)
        raise ScrapeError("We couldn't connect to that website. It may be down.", 502, "site_unreachable") from None

    raise ScrapeError("That page keeps redirecting, so we couldn't open it.", 502, "too_many_redirects")


class SafeSession:
    def __init__(self):
        self.direct, self.proxy = http_clients()
        self.clients = {"direct": self.direct, "proxy": self.proxy}

    def request(self, method, url, headers=None, content=None, limit=None):
        client, request = build_request(self.clients, url, method, headers, content)
        response = client.send(request, stream=True)
        try:
            deadline = time.monotonic() + settings.SCRAPER_TIMEOUT
            body, _ = read_limited(response, deadline, limit=limit)
            return response.status_code, dict(response.headers), body
        finally:
            response.close()

    def close(self):
        self.direct.close()
        self.proxy.close()


def extract_text(html, encoding=None):
    return extractors.html_text(html, encoding)


def read_html(fetched, check_cancelled):
    title, text = extractors.html_text(fetched["body"], fetched["charset"])
    if len(text) >= settings.SCRAPER_MIN_TEXT_CHARS:
        return "html", title, text

    data_title, data_text = extractors.embedded_text(fetched["body"], fetched["charset"])
    if len(data_text) > len(text):
        logger.debug("Using the page's built-in data (%d chars)", len(data_text))
        title, text = title or data_title, data_text

    if len(text) >= settings.SCRAPER_MIN_TEXT_CHARS * 4 or not browser.available():
        return "html", title, text

    yield {"type": "step", "step": "rendering"}
    rendered = browser.render(fetched["url"], check_cancelled)
    if rendered:
        browser_title, browser_text = extractors.html_text(rendered)
        if len(browser_text) > len(text):
            return "html", browser_title or title, browser_text
    return "html", title, text


def too_large(kind):
    limit = settings.SCRAPER_MAX_DOWNLOAD_BYTES // (1024 * 1024)
    return ScrapeError(f"That {kind} is too large. The limit is {limit} MB.", 413, "file_too_large")


def scrape_steps(url, check_cancelled=no_check):
    fetched = fetch(url, check_cancelled)
    kind = extractors.detect_kind(fetched["content_type"], fetched["url"], fetched["body"])
    logger.debug("Content looks like %s", kind)
    image = None

    if kind == "html":
        kind, title, text = yield from read_html(fetched, check_cancelled)
    elif kind == "pdf":
        if fetched["truncated"]:
            raise too_large("PDF")
        title, text = extractors.pdf_text(fetched["body"])
    elif kind == "docx":
        if fetched["truncated"]:
            raise too_large("document")
        title, text = extractors.docx_text(fetched["body"])
    elif kind == "image":
        if fetched["truncated"]:
            raise too_large("image")
        image = extractors.image_data(fetched["body"], fetched["content_type"])
        title, text = "", ""
    elif kind == "json":
        title, text = extractors.json_text(fetched["body"], fetched["charset"])
    elif kind == "csv":
        title, text = extractors.csv_text(fetched["body"], fetched["charset"])
    elif kind == "xml":
        title, text = extractors.xml_text(fetched["body"])
    elif kind == "text":
        title, text = "", extractors.decode(fetched["body"], fetched["charset"])
    elif kind == "media":
        raise ScrapeError("Videos and audio can't be summarized yet. Try a web page, PDF or image.", 415, "unsupported_type")
    else:
        raise ScrapeError("This kind of file can't be summarized. Try a web page, PDF or document.", 415, "unsupported_type")

    if image is None and len(text.strip()) < settings.SCRAPER_MIN_TEXT_CHARS:
        raise ScrapeError("We couldn't find readable text there.", 422, "no_text")

    text = text.strip()
    limit = settings.SCRAPER_MAX_TEXT_CHARS
    yield {
        "type": "page",
        "page": {
            "title": title or extractors.file_name(fetched["url"]),
            "url": fetched["url"],
            "kind": kind,
            "text": text[:limit],
            "image": image,
            "char_count": len(text),
            "word_count": len(text.split()),
            "truncated": len(text) > limit,
        },
    }


def scrape_page(url, check_cancelled=no_check):
    for step in scrape_steps(url, check_cancelled):
        if step["type"] == "page":
            return step["page"]
    raise ScrapeError("We couldn't find readable text there.", 422, "no_text")
