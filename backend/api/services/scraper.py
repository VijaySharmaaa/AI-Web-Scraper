import ipaddress
import logging
import socket
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from ..exceptions import ScrapeError

logger = logging.getLogger(__name__)

# don't send a whole book to the AI, this is enough for a summary
MAX_TEXT_LENGTH = 15000

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
}

# tags that are almost never part of the main content
JUNK_TAGS = ["script", "style", "noscript", "iframe", "svg", "form",
             "nav", "header", "footer", "aside", "button"]


def check_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ScrapeError("Please enter a valid http or https URL")

    # block localhost / internal ips so people can't use the deployed
    # server to poke around the hosting network
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        raise ScrapeError(f"Could not find the website '{parsed.hostname}'") from None

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            logger.warning("Blocked private address %s for %s", ip, url)
            raise ScrapeError("That URL points to a private address, not allowed")


def fetch_html(url):
    check_url(url)
    logger.debug("Fetching %s", url)

    try:
        # follow redirects by hand so every hop goes through check_url
        with httpx.Client(headers=HEADERS, timeout=15, follow_redirects=False) as client:
            response = client.get(url)
            hops = 0
            while response.is_redirect and hops < 5:
                url = str(response.next_request.url)
                check_url(url)
                logger.debug("Redirected to %s", url)
                response = client.get(url)
                hops += 1
    except httpx.TimeoutException:
        raise ScrapeError("The website took too long to respond", 504) from None
    except httpx.RequestError as e:
        logger.debug("Request to %s failed: %r", url, e)
        raise ScrapeError("Could not connect to the website", 502) from None

    content_type = response.headers.get("content-type", "")
    logger.debug("Got status=%s content-type=%s", response.status_code, content_type)

    if response.status_code >= 400:
        raise ScrapeError(f"The website returned an error (HTTP {response.status_code})", 502)
    if "html" not in content_type:
        raise ScrapeError("That URL is not a web page (maybe a PDF or image?)", 415)

    return response.text, url


def extract_text(html):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else ""

    for tag in soup(JUNK_TAGS):
        tag.decompose()

    # most blogs / news sites put the content in <article> or <main>
    content = soup.find("article") or soup.find("main") or soup.body or soup

    lines = []
    for el in content.find_all(["h1", "h2", "h3", "p", "li", "blockquote", "pre"]):
        text = " ".join(el.get_text(" ").split())
        if text and text not in lines:
            lines.append(text)
    text = "\n".join(lines)

    # some sites only use divs, so just grab all the text in that case
    if len(text) < 200:
        logger.debug("Not many <p> tags found, falling back to all text")
        text = " ".join(content.get_text(" ").split())

    return title, text


def scrape_page(url):
    html, final_url = fetch_html(url)
    title, text = extract_text(html)
    logger.debug("Title=%r, extracted %d chars", title, len(text))

    if len(text) < 50:
        raise ScrapeError(
            "Couldn't find any readable text on that page. It probably needs JavaScript to load.",
            422,
        )

    return {
        "title": title or final_url,
        "url": final_url,
        "text": text[:MAX_TEXT_LENGTH],
        "char_count": len(text),
        "truncated": len(text) > MAX_TEXT_LENGTH,
    }
