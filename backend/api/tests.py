import socket
from unittest.mock import patch

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from .exceptions import AIError, ScrapeError
from .services import ai, scraper
from .services.scraper import extract_text, scrape_page

FAKE_PAGE = {
    "title": "Test page",
    "url": "https://example.com/",
    "text": "hello world " * 20,
    "char_count": 240,
    "word_count": 40,
    "truncated": False,
}

ARTICLE_HTML = b"""
<html><head><title>My Post</title><script>var x = 1;</script></head>
<body><nav>Home | About</nav>
<article><h1>Hello</h1><p>This is the real content of the article, long enough to count.</p></article>
<footer>copyright</footer></body></html>
"""

PUBLIC_IP = "93.184.216.34"


def fake_dns(mapping):
    """Pretend DNS: hostname -> ip."""
    def getaddrinfo(host, *args, **kwargs):
        if host not in mapping:
            raise socket.gaierror("not found")
        ip = mapping[host]
        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        return [(family, socket.SOCK_STREAM, 6, "", (ip, 0))]
    return patch("api.services.scraper.socket.getaddrinfo", side_effect=getaddrinfo)


def fake_site(handler, proxy=False):
    transport = patch.object(scraper, "TRANSPORT", httpx.MockTransport(handler))
    # don't depend on the proxy settings of the machine running the tests
    no_proxy = patch.object(scraper, "uses_proxy", return_value=proxy)
    return _both(transport, no_proxy)


class _both:
    def __init__(self, *patches):
        self.patches = patches

    def __enter__(self):
        for p in self.patches:
            p.__enter__()

    def __exit__(self, *exc):
        for p in reversed(self.patches):
            p.__exit__(*exc)


def html_response(body=ARTICLE_HTML, status=200, content_type="text/html; charset=utf-8", **kw):
    return httpx.Response(status, content=body, headers={"content-type": content_type, **kw.pop("headers", {})}, **kw)


class ExtractTextTests(SimpleTestCase):
    def test_removes_nav_and_scripts(self):
        title, text = extract_text(ARTICLE_HTML)
        self.assertEqual(title, "My Post")
        self.assertIn("This is the real content", text)
        self.assertNotIn("Home | About", text)
        self.assertNotIn("var x", text)
        self.assertNotIn("copyright", text)

    def test_prefers_og_title(self):
        html = b'<html><head><title>Site</title><meta property="og:title" content="Real Title"></head><body></body></html>'
        title, _ = extract_text(html)
        self.assertEqual(title, "Real Title")

    def test_non_utf8_page(self):
        html = "<html><body><p>Caf\xe9 cr\xe8me br\xfbl\xe9e</p></body></html>".encode("latin-1")
        _, text = extract_text(html, "iso-8859-1")
        self.assertIn("Café crème brûlée", text)

    def test_falls_back_to_all_text_for_div_pages(self):
        html = b"<html><body><div>" + b"Some text in a div. " * 20 + b"</div></body></html>"
        _, text = extract_text(html)
        self.assertIn("Some text in a div.", text)


class UrlSafetyTests(SimpleTestCase):
    def assert_blocked(self, url, dns=None):
        with fake_dns(dns or {}), self.assertRaises(ScrapeError):
            scrape_page(url)

    def test_blocks_private_and_local_addresses(self):
        for ip in ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254",
                   "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]:
            with self.subTest(ip=ip):
                self.assert_blocked("http://evil.test/", {"evil.test": ip})

    def test_blocks_bad_schemes_ports_and_credentials(self):
        for url in ["ftp://example.com/", "file:///etc/passwd", "http://user:pass@example.com/",
                    "http://example.com:22/", "http://example.com:6379/"]:
            with self.subTest(url=url):
                self.assert_blocked(url, {"example.com": PUBLIC_IP})

    def test_connects_to_the_checked_ip_not_a_new_lookup(self):
        seen = {}

        def handler(request):
            seen["host"] = request.url.host
            seen["host_header"] = request.headers["host"]
            return html_response()

        with fake_dns({"example.com": PUBLIC_IP}), fake_site(handler):
            scrape_page("https://example.com/post")
        self.assertEqual(seen["host"], PUBLIC_IP)
        self.assertEqual(seen["host_header"], "example.com")

    def test_behind_a_proxy_uses_the_hostname(self):
        seen = {}

        def handler(request):
            seen["host"] = request.url.host
            return html_response()

        with fake_dns({"example.com": PUBLIC_IP}), fake_site(handler, proxy=True):
            scrape_page("https://example.com/post")
        self.assertEqual(seen["host"], "example.com")

    def test_redirect_to_private_ip_is_blocked(self):
        def handler(request):
            return httpx.Response(302, headers={"location": "http://internal.test/admin"})

        with fake_dns({"example.com": PUBLIC_IP, "internal.test": "10.1.2.3"}), fake_site(handler):
            with self.assertRaises(ScrapeError) as ctx:
                scrape_page("https://example.com/")
        self.assertIn("private", str(ctx.exception.detail))

    def test_follows_normal_redirects(self):
        def handler(request):
            if request.url.path == "/old":
                return httpx.Response(301, headers={"location": "/new"})
            return html_response()

        with fake_dns({"example.com": PUBLIC_IP}), fake_site(handler):
            page = scrape_page("https://example.com/old")
        self.assertEqual(page["url"], "https://example.com/new")

    def test_redirect_loop(self):
        def handler(request):
            return httpx.Response(302, headers={"location": "/again"})

        with fake_dns({"example.com": PUBLIC_IP}), fake_site(handler):
            with self.assertRaises(ScrapeError) as ctx:
                scrape_page("https://example.com/")
        self.assertIn("redirected too many times", str(ctx.exception.detail))


class FetchErrorTests(SimpleTestCase):
    def scrape_with(self, response):
        with fake_dns({"example.com": PUBLIC_IP}), fake_site(lambda r: response):
            return scrape_page("https://example.com/")

    def test_non_html_is_rejected(self):
        with self.assertRaises(ScrapeError) as ctx:
            self.scrape_with(html_response(b"%PDF", content_type="application/pdf"))
        self.assertEqual(ctx.exception.status_code, 415)
        self.assertEqual(ctx.exception.error_code, "not_html")

    def test_http_errors_have_friendly_messages(self):
        for status, words in [(403, "blocked"), (404, "doesn't exist"), (500, "HTTP 500")]:
            with self.subTest(status=status), self.assertRaises(ScrapeError) as ctx:
                self.scrape_with(html_response(status=status))
            self.assertIn(words, str(ctx.exception.detail))

    def test_huge_page_is_cut_off(self):
        body = b"<html><body>" + b"<p>" + b"word " * 2_000_000 + b"</p></body></html>"
        page = self.scrape_with(html_response(body))
        self.assertTrue(page["truncated"])
        self.assertEqual(len(page["text"]), scraper.MAX_TEXT_LENGTH)

    def test_page_without_text(self):
        with self.assertRaises(ScrapeError) as ctx:
            self.scrape_with(html_response(b"<html><body><div id='root'></div></body></html>"))
        self.assertIn("JavaScript", str(ctx.exception.detail))

    def test_unknown_host(self):
        with fake_dns({}), self.assertRaises(ScrapeError) as ctx:
            scrape_page("https://does-not-exist.test/")
        self.assertIn("Could not find", str(ctx.exception.detail))


def gemini_ok(text="**TL;DR:** it works"):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}]})


def groq_ok(text="**TL;DR:** from groq"):
    return httpx.Response(200, json={"choices": [{"message": {"content": text}, "finish_reason": "stop"}]})


@patch.dict("os.environ", {"GEMINI_API_KEY": "g-key", "GROQ_API_KEY": "q-key",
                           "GEMINI_MODELS": "gem-a,gem-b", "GROQ_MODELS": "llama-a"})
class AIFallbackTests(SimpleTestCase):
    def run_with(self, responses):
        """responses: list of httpx.Response in the order the models get called"""
        calls = []

        def fake_post(url, **kwargs):
            calls.append(kwargs.get("json", {}).get("model") or url.split("/models/")[1].split(":")[0])
            return responses[len(calls) - 1]

        with patch("api.services.ai.httpx.post", side_effect=fake_post):
            return ai.summarize(FAKE_PAGE), calls

    def test_first_model_works(self):
        result, calls = self.run_with([gemini_ok()])
        self.assertEqual(result["provider"], "Google Gemini")
        self.assertEqual(result["model"], "gem-a")
        self.assertEqual(result["failed_attempts"], [])
        self.assertEqual(calls, ["gem-a"])

    def test_falls_back_to_next_gemini_model(self):
        result, calls = self.run_with([httpx.Response(429, json={}), gemini_ok()])
        self.assertEqual(result["model"], "gem-b")
        self.assertEqual(result["failed_attempts"][0]["model"], "gem-a")
        self.assertIn("rate limited", result["failed_attempts"][0]["error"])

    def test_falls_back_to_groq(self):
        result, calls = self.run_with([httpx.Response(503), httpx.Response(404), groq_ok()])
        self.assertEqual(result["provider"], "Groq")
        self.assertEqual(result["model"], "llama-a")
        self.assertEqual(len(result["failed_attempts"]), 2)
        self.assertEqual(calls, ["gem-a", "gem-b", "llama-a"])

    def test_empty_response_moves_on(self):
        empty = httpx.Response(200, json={"candidates": [{"content": {"parts": []}}]})
        result, _ = self.run_with([empty, gemini_ok("second")])
        self.assertEqual(result["summary"], "second")

    def test_thought_parts_are_skipped(self):
        resp = httpx.Response(200, json={"candidates": [{"content": {"parts": [
            {"text": "thinking...", "thought": True}, {"text": "answer"}]}}]})
        result, _ = self.run_with([resp])
        self.assertEqual(result["summary"], "answer")

    def test_all_rate_limited(self):
        with self.assertRaises(AIError) as ctx:
            self.run_with([httpx.Response(429)] * 3)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.error_code, "ai_quota")

    def test_all_fail(self):
        with self.assertRaises(AIError) as ctx:
            self.run_with([httpx.Response(500)] * 3)
        self.assertIn("All 3 AI models failed", str(ctx.exception.detail))

    def test_timeout_moves_on(self):
        calls = []

        def fake_post(url, **kwargs):
            calls.append(url)
            if len(calls) == 1:
                raise httpx.ReadTimeout("slow")
            return gemini_ok()

        with patch("api.services.ai.httpx.post", side_effect=fake_post):
            result = ai.summarize(FAKE_PAGE)
        self.assertEqual(result["failed_attempts"][0]["error"], "timed out")

    def test_stops_trying_when_out_of_time(self):
        clock = iter([0, 0, 80, 80, 80, 80])  # second model starts after the time limit

        with patch("api.services.ai.time.monotonic", side_effect=lambda: next(clock)), \
                patch("api.services.ai.httpx.post", return_value=httpx.Response(500)) as mock_post:
            with self.assertRaises(AIError):
                ai.summarize(FAKE_PAGE)
        self.assertEqual(mock_post.call_count, 1)

    def test_preferred_model_goes_first(self):
        calls = []

        def fake_post(url, **kwargs):
            calls.append(kwargs.get("json", {}).get("model") or url.split("/models/")[1].split(":")[0])
            return groq_ok()

        with patch("api.services.ai.httpx.post", side_effect=fake_post):
            result = ai.summarize(FAKE_PAGE, preferred_model="llama-a")
        self.assertEqual(calls, ["llama-a"])
        self.assertEqual(result["model"], "llama-a")

    def test_preferred_model_still_falls_back(self):
        responses = [httpx.Response(429), gemini_ok()]
        calls = []

        def fake_post(url, **kwargs):
            calls.append(kwargs.get("json", {}).get("model") or url.split("/models/")[1].split(":")[0])
            return responses[len(calls) - 1]

        with patch("api.services.ai.httpx.post", side_effect=fake_post):
            result = ai.summarize(FAKE_PAGE, preferred_model="gem-b")
        self.assertEqual(calls, ["gem-b", "gem-a"])
        self.assertEqual(result["model"], "gem-a")
        self.assertEqual(result["failed_attempts"][0]["model"], "gem-b")

    def test_unknown_preferred_model(self):
        with self.assertRaises(AIError) as ctx:
            ai.summarize(FAKE_PAGE, preferred_model="gpt-5")
        self.assertEqual(ctx.exception.error_code, "invalid_model")

    @patch.dict("os.environ", {"GROQ_API_KEY": ""})
    def test_provider_without_key_is_skipped(self):
        models = [m for _, m, *_ in ai.configured_models()]
        self.assertEqual(models, ["gem-a", "gem-b"])

    @patch.dict("os.environ", {"GEMINI_API_KEY": "", "GROQ_API_KEY": ""})
    def test_no_keys(self):
        with self.assertRaises(AIError) as ctx:
            ai.summarize(FAKE_PAGE)
        self.assertEqual(ctx.exception.status_code, 503)


AI_RESULT = {"summary": "**TL;DR:** test", "provider": "Google Gemini", "model": "gem-a", "failed_attempts": []}


class SummarizeApiTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def post(self, data):
        return self.client.post("/api/summarize/", data, format="json")

    def test_missing_url(self):
        res = self.post({})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"], "Please enter a URL.")

    def test_invalid_url(self):
        res = self.post({"url": "not a url"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("valid URL", res.json()["error"])

    def test_wrong_type(self):
        res = self.post({"url": 123})
        self.assertEqual(res.status_code, 400)

    def test_localhost_is_blocked(self):
        res = self.post({"url": "http://127.0.0.1/"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("private", res.json()["error"])
        self.assertEqual(res.json()["code"], "private_address")

    def test_not_json(self):
        res = self.client.post("/api/summarize/", "url=x", content_type="application/x-www-form-urlencoded")
        self.assertEqual(res.status_code, 415)
        self.assertIn("error", res.json())

    def test_get_not_allowed(self):
        res = self.client.get("/api/summarize/")
        self.assertEqual(res.status_code, 405)
        self.assertIn("error", res.json())

    def test_unknown_api_route_is_json_404(self):
        res = self.client.get("/api/nope/")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["error"], "API endpoint not found")

    @patch("api.views.summarize", return_value=AI_RESULT)
    @patch("api.views.scrape_page", return_value=FAKE_PAGE)
    def test_success(self, mock_scrape, mock_ai):
        res = self.post({"url": "example.com"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["summary"], "**TL;DR:** test")
        self.assertEqual(data["provider"], "Google Gemini")
        self.assertEqual(data["model"], "gem-a")
        self.assertEqual(data["word_count"], 40)
        # "example.com" should get https:// added
        mock_scrape.assert_called_once_with("https://example.com")
        self.assertEqual(res["Cache-Control"], "no-store")

    @patch("api.views.scrape_page", side_effect=RuntimeError("boom"))
    def test_unexpected_crash_is_json(self, _):
        res = self.post({"url": "https://example.com"})
        self.assertEqual(res.status_code, 500)
        self.assertNotIn("boom", res.json()["error"])

    @patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"summarize": "2/min", "anon": "100/min"})
    @patch("api.views.summarize", return_value=AI_RESULT)
    @patch("api.views.scrape_page", return_value=FAKE_PAGE)
    def test_rate_limit(self, *_):
        codes = [self.post({"url": "https://example.com"}).status_code for _ in range(2)]
        res = self.post({"url": "https://example.com"})
        self.assertEqual(codes, [200, 200])
        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.json()["code"], "throttled")
        self.assertIn("retry_after", res.json())

    @patch.dict("os.environ", {"GEMINI_API_KEY": "k", "GROQ_API_KEY": "", "GEMINI_MODELS": "gem-a,gem-b"})
    @patch("api.views.summarize", return_value=AI_RESULT)
    @patch("api.views.scrape_page", return_value=FAKE_PAGE)
    def test_chosen_model_is_passed_on(self, mock_scrape, mock_ai):
        res = self.post({"url": "https://example.com", "model": "gem-b"})
        self.assertEqual(res.status_code, 200)
        mock_ai.assert_called_once_with(FAKE_PAGE, preferred_model="gem-b")
        self.assertEqual(res.json()["requested_model"], "gem-b")

    @patch.dict("os.environ", {"GEMINI_API_KEY": "k", "GROQ_API_KEY": "", "GEMINI_MODELS": "gem-a"})
    @patch("api.views.scrape_page", return_value=FAKE_PAGE)
    def test_unknown_model_is_rejected_before_scraping(self, mock_scrape):
        res = self.post({"url": "https://example.com", "model": "gpt-5"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["code"], "invalid_model")
        mock_scrape.assert_not_called()

    def test_model_name_with_bad_characters(self):
        res = self.post({"url": "https://example.com", "model": "gem a; rm -rf"})
        self.assertEqual(res.status_code, 400)

    @patch("api.views.summarize", return_value=AI_RESULT)
    @patch("api.views.scrape_page", return_value=FAKE_PAGE)
    def test_empty_model_means_auto(self, mock_scrape, mock_ai):
        res = self.post({"url": "https://example.com", "model": ""})
        self.assertEqual(res.status_code, 200)
        mock_ai.assert_called_once_with(FAKE_PAGE, preferred_model=None)
        self.assertIsNone(res.json()["requested_model"])

    def test_health(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": "secret-key-value", "GROQ_API_KEY": ""}):
            res = self.client.get("/api/health/")
        data = res.json()
        self.assertTrue(data["ai_ready"])
        self.assertEqual(data["providers"], ["Google Gemini"])
        self.assertEqual(data["model_options"][0]["provider"], "Google Gemini")
        self.assertNotIn("secret-key-value", res.content.decode())

    def test_security_headers(self):
        res = self.client.get("/api/health/")
        self.assertIn("default-src 'self'", res["Content-Security-Policy"])
        self.assertEqual(res["X-Frame-Options"], "DENY")
        self.assertEqual(res["X-Content-Type-Options"], "nosniff")
