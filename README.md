# InsightEngine Web
![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)

The web frontend for the InsightEngine platform. Built with Angular, the application provides interfaces for conversational AI workflows, knowledge graph exploration, project management, and scientific research activities across the C-BRAIN ecosystem.

---

## Overview

The InsightEngine Web application provides the primary user interface for interacting with the InsightEngine platform. It enables conversational AI workflows, project management, knowledge graph exploration, and access to research-oriented analysis services exposed by the platform backend.

## System Context

This repository is one of four core services that comprise the InsightEngine platform:

* **User Service (`C-brAIn-InsightEngine-user-service`)** — authentication, authorization, and identity management
* **Backend API Service (`C-brAIn-InsightEngine-api`)** — application backend, workflow orchestration, and platform services
* **AI Service (`C-brAIn-InsightEngine-ai`)** — scientific reasoning, retrieval, and hypothesis evaluation
* **Web Frontend (`C-brAIn-InsightEngine-web` - this repository)** — user-facing application and research workspace

The Web Frontend serves as the primary interface through which researchers and platform users interact with the broader C-BRAIN ecosystem.

## Governance and Origin

The platform was initiated and funded through the Consortium for Biomedical Research & AI in Neurodegeneration (C-BRAIN) and developed through a collaboration between Arti Analytics Inc., 387Labs, and collaborating academic researchers and research institutions.

This repository provides the web-based user experience for interacting with platform services, workflows, and research outputs.

---

## Key Features

### Multi-LLM Support

* Integration with multiple LLM providers
* Dynamic model selection
* Flexible model switching within conversations

### Conversational AI

* Real-time chat interface with streaming responses
* Multi-turn conversation management
* Session persistence and history
* Message feedback and rating capabilities

### Knowledge Graph Visualization

* Interactive graph visualization powered by Cytoscape
* Exploration and navigation of connected entities and relationships
* Citation tracking and evidence transparency

### Project and File Management

* Project-based organization of conversations and analyses
* File upload and attachment support
* Predefined workflow templates
* Document processing integration

### Analysis and Research Workflows

* Structured analysis presentation
* Reasoning step visualization
* Hypothesis generation and evaluation
* Research-oriented workflow support

### User Experience

* User preference management
* Theme selection
* Customizable layouts
* Authentication and access control

### Real-Time Communication

* SignalR-based messaging
* Live updates and event-driven interactions

---

## Technology Stack

### Frontend Framework

* Angular
* TypeScript
* RxJS
* SCSS

### UI and Visualization

* Bootstrap Icons
* Cytoscape
* Cytoscape FCOSE

### Communication and Authentication

* SignalR
* JWT-based authentication
* Angular HTTP Client

### Development Tools

* Angular CLI
* Webpack
* Karma
* Jasmine

---

## Prerequisites

### System Requirements

* Node.js (see `.nvmrc` for the recommended version)
* npm
* Git

### Environment

* Access to the platform backend services
* Valid authentication credentials for development environments

---

## Getting Started

### Installation

Clone the repository:

```bash
git clone <repository-url>
cd C-brAIn-InsightEngine-web
```

Install dependencies:

```bash
npm install
```

### Development Server

Start the development server:

```bash
npm start
```

The application will be available at:

```text
http://localhost:4200
```

Changes to source files will automatically trigger a rebuild and refresh.

### Production Build

Create a production build:

```bash
npm run build
```

Compiled assets will be generated in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Contributing

Contributions are welcome.

Recommended workflow:

1. Fork the repository
2. Create a feature branch
3. Make focused changes
4. Update documentation when necessary
5. Ensure tests pass
6. Open a pull request describing the change

Please keep changes well scoped and document any new configuration requirements.

## Support

For issues, questions, feature requests, or bug reports, please open a GitHub issue in this repository.

When reporting issues, please include:

* A clear description of the problem
* Steps to reproduce the issue
* Expected and actual behavior
* Relevant logs, screenshots, or error messages
* Environment information (browser, operating system, application version)

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.





