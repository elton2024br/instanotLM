# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in InstaNotLM, please report it responsibly.

**Do NOT create a public issue for security vulnerabilities.**

### Reporting Process

1. Email: security@instanotlm.dev (or create a private security advisory)
2. Include:
   - Description of the vulnerability
   - Steps to reproduce (if applicable)
   - Potential impact
   - Suggested fix (optional)

3. We will respond within 48 hours and provide updates on remediation

## Security Best Practices

### For Users

- Keep your Chrome browser updated
- Only use the official extension from GitHub
- Enable 2FA on your Instagram account
- Review permissions requested by the extension
- Only extract data from public profiles you have permission to analyze

### For Developers

- Use environment variables for sensitive data
- Never commit API keys or credentials
- Follow least privilege principle
- Validate all user inputs
- Keep dependencies updated

## Known Security Details

### Manifest V3 Benefits
- Sandboxed content scripts
- Isolated world for extension code
- Content Security Policy enforcement
- Limited API access

### Data Handling
- InstaNotLM does NOT transmit extracted data to external servers
- Data processing happens locally in your browser
- Exported files are saved to your local Downloads folder
- No analytics or tracking

### Authentication
- Extension uses your existing Instagram session (cookies)
- No passwords are stored or transmitted
- Authentication is handled by Instagram, not InstaNotLM

## Dependency Security

We use the following tools to maintain security:
- Regular dependency audits
- Automated security scanning
- GitHub security advisories
- Manual code reviews

## Security Advisories

All security issues are tracked here: [Security Advisories](https://github.com/elton2024br/instanotLM/security/advisories)

## Compliance

- Follows Chrome Web Store Security Requirements
- Respects Instagram Terms of Service
- Complies with data protection regulations
- No unauthorized data collection or sharing
