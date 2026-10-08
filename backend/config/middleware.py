class SecurityHeadersMiddleware:
    """Adds a Content Security Policy and a few other headers Django doesn't set."""

    CSP = "; ".join([
        "default-src 'self'",
        "script-src 'self'",
        # tailwind / radix set some inline styles
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    ])

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("Content-Security-Policy", self.CSP)
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.path.startswith("/api/"):
            # summaries depend on live pages, never cache api responses
            response.setdefault("Cache-Control", "no-store")
        return response
