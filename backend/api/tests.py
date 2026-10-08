from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from .services.scraper import extract_text

FAKE_PAGE = {
    "title": "Test page",
    "url": "https://example.com/",
    "text": "hello world " * 20,
    "char_count": 240,
    "truncated": False,
}


class ExtractTextTests(SimpleTestCase):
    def test_removes_nav_and_scripts(self):
        html = """
        <html><head><title>My Post</title><script>var x = 1;</script></head>
        <body><nav>Home | About</nav>
        <article><h1>Hello</h1><p>This is the real content.</p></article>
        <footer>copyright</footer></body></html>
        """
        title, text = extract_text(html)
        self.assertEqual(title, "My Post")
        self.assertIn("This is the real content.", text)
        self.assertNotIn("Home | About", text)
        self.assertNotIn("var x", text)
        self.assertNotIn("copyright", text)


class SummarizeApiTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    def test_missing_url(self):
        res = self.client.post("/api/summarize/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.json())

    def test_invalid_url(self):
        res = self.client.post("/api/summarize/", {"url": "not a url"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_localhost_is_blocked(self):
        res = self.client.post("/api/summarize/", {"url": "http://127.0.0.1:8000/"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("private", res.json()["error"])

    @patch("api.views.summarize", return_value=("**TL;DR:** test", "gemini-test"))
    @patch("api.views.scrape_page", return_value=FAKE_PAGE)
    def test_success(self, mock_scrape, mock_ai):
        res = self.client.post("/api/summarize/", {"url": "example.com"}, format="json")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["summary"], "**TL;DR:** test")
        self.assertEqual(data["title"], "Test page")
        # "example.com" should get https:// added
        mock_scrape.assert_called_once_with("https://example.com")


class GeminiTests(SimpleTestCase):
    @patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"})
    @patch("api.services.ai.httpx.post")
    def test_reads_summary_from_response(self, mock_post):
        from .services.ai import summarize

        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "**TL;DR:** it works"}]}}]
        }
        summary, model = summarize(FAKE_PAGE)
        self.assertEqual(summary, "**TL;DR:** it works")
        self.assertTrue(model)

    @patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"})
    @patch("api.services.ai.httpx.post")
    def test_rate_limit_error(self, mock_post):
        from .exceptions import AIError
        from .services.ai import summarize

        mock_post.return_value.status_code = 429
        mock_post.return_value.json.return_value = {}
        with self.assertRaises(AIError) as ctx:
            summarize(FAKE_PAGE)
        self.assertEqual(ctx.exception.status_code, 429)
