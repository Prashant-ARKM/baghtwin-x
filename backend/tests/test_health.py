"""Skeleton smoke tests: app object, health payload, CORS preflight."""

from fastapi.testclient import TestClient

from api.main import CORS_ALLOW_ORIGINS, app

client = TestClient(app)


def test_health_ok():
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["simulation"] is True
    assert "model_version" in body


def test_cors_allows_frontend_origin():
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "http://localhost:3000" in CORS_ALLOW_ORIGINS
