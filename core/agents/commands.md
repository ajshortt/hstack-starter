Add your stack's install, build, lint and test commands as checks in `.hstack-kit/checks/local.json`, so agents and CI run exactly the same thing. For example:

```json
{ "setup": ["pip install -r requirements.txt"], "checks": [{ "id": "test", "name": "unit tests", "run": "pytest -q" }] }
```
