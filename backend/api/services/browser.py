import importlib.util
import logging
import threading
import time

from django.conf import settings

from ..exceptions import Cancelled

logger = logging.getLogger(__name__)

SKIPPED_RESOURCES = {"image", "media", "font", "manifest", "texttrack", "eventsource", "websocket"}
HOP_HEADERS = {"content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"}

_slots = None
_slots_lock = threading.Lock()


def available():
    return settings.SCRAPER_BROWSER != "off" and importlib.util.find_spec("playwright") is not None


def slots():
    global _slots
    with _slots_lock:
        if _slots is None:
            _slots = threading.BoundedSemaphore(max(1, settings.SCRAPER_BROWSER_CONCURRENCY))
    return _slots


def render(url, check_cancelled=lambda: None):
    if not available():
        return None
    if not slots().acquire(timeout=settings.SCRAPER_BROWSER_TIMEOUT):
        logger.warning("All browser slots are busy, skipping rendering for %s", url)
        return None
    try:
        return _render(url, check_cancelled)
    finally:
        slots().release()


def _render(url, check_cancelled):
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import sync_playwright

    from .scraper import SafeSession

    session = SafeSession()
    requests_made = 0
    deadline = time.monotonic() + settings.SCRAPER_BROWSER_TIMEOUT

    def handle(route):
        nonlocal requests_made
        request = route.request
        if request.resource_type in SKIPPED_RESOURCES or not request.url.startswith(("http://", "https://")):
            route.abort()
            return
        requests_made += 1
        if requests_made > settings.SCRAPER_BROWSER_MAX_REQUESTS or time.monotonic() > deadline:
            route.abort()
            return
        try:
            status, headers, body = session.request(
                request.method,
                request.url,
                headers={k: v for k, v in request.headers.items() if not k.startswith(":")},
                content=request.post_data_buffer,
            )
        except Exception as e:
            logger.debug("Browser request blocked or failed %s: %r", request.url, e)
            route.abort()
            return
        clean_headers = {k: v for k, v in headers.items() if k.lower() not in HOP_HEADERS}
        route.fulfill(status=status, headers=clean_headers, body=body)

    launch = {"headless": True, "args": ["--disable-dev-shm-usage", "--no-sandbox"]}
    if settings.SCRAPER_BROWSER_EXECUTABLE:
        launch["executable_path"] = settings.SCRAPER_BROWSER_EXECUTABLE

    started = time.monotonic()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(**launch)
            try:
                context = browser.new_context(
                    user_agent=settings.SCRAPER_USER_AGENT,
                    java_script_enabled=True,
                    service_workers="block",
                    accept_downloads=False,
                )
                context.route("**/*", handle)
                context.route_web_socket("**/*", lambda ws: ws.close())
                page = context.new_page()
                timeout_ms = settings.SCRAPER_BROWSER_TIMEOUT * 1000
                page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                check_cancelled()
                try:
                    page.wait_for_load_state("networkidle", timeout=max(1.0, deadline - time.monotonic()) * 1000)
                except PlaywrightError:
                    logger.debug("Page kept loading, reading what's there")
                check_cancelled()
                html = page.content()
            finally:
                browser.close()
    except Cancelled:
        raise
    except PlaywrightError as e:
        logger.warning("Browser rendering failed for %s: %s", url, str(e).splitlines()[0])
        return None
    finally:
        session.close()

    logger.info("Rendered %s in a browser in %.1fs (%d requests)", url, time.monotonic() - started, requests_made)
    return html
