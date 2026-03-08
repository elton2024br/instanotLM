# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-15 (PLANNED)

### Added
- Chrome Extension with complete Instagram profile extraction
- Support for Manifest V3 (latest Chrome extension standard)
- Python CLI pipeline for advanced extraction
- Automatic document generation for Google NotebookLM
- Anti-detection system with random delays and retry logic
- Support for 3 fallback extraction methods (API v1, GraphQL, DOM)
- OCR support using Instagram's built-in image descriptions
- Markdown and JSON export formats
- Configurable extraction options (post limit, ordering, formats)
- Detailed statistics and analytics
- Hashtag and mention frequency analysis
- Post timeline aggregation

### Fixed
- Handle rate limiting from Instagram gracefully
- Proper session management
- Image loading optimization

## [0.1.0] - 2026-02-08

### Initial Release
- Basic Chrome Extension for Instagram profile extraction
- Python pipeline foundation
- Core extraction functionality
- README and documentation

---

## Unreleased

### Planned Features

#### Coming in v1.1.0 (Q2 2026)
- Real-time OCR using Tesseract.js
- PDF export format
- Comment extraction and analysis
- Extraction history and caching
- Stories and Highlights support
- Offline worker for heavy processing

#### Future Roadmap (v1.2+)
- TikTok and Facebook support
- Advanced analytics and pattern detection
- Chrome Web Store publication
- Browser extension for Firefox/Edge
- API endpoint for programmatic access
- Web dashboard for management
- Multi-profile batch extraction
- Custom report generation

---

## Version History

### Legend
- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Now removed features
- **Fixed**: Bug fixes
- **Security**: Security-related fixes

### Migration Guides

#### Upgrading to v1.0.0
No breaking changes. Extension will auto-update in Chrome.
