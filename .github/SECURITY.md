# Security policy

## Supported versions

Security fixes are applied to the latest release and the current `main` branch. Older releases are
not supported.

## Reporting a vulnerability

Please use the repository's **Security → Report a vulnerability** form to submit reports
privately. Include the affected version or commit, impact, reproduction steps, and any suggested
mitigation.

Do not open a public issue for an undisclosed vulnerability, and do not include credentials,
tokens, private URLs, or data belonging to other people in a report. If private vulnerability
reporting is temporarily unavailable, contact the maintainer privately before disclosing details.

## Deployment boundary

The web application is designed for loopback-only use. Exposing it through a reverse proxy,
container ingress, tunnel, or public listening address is unsupported because it can launch a
browser and fetch operator-supplied URLs. Use the CLI for unattended or remote automation.
