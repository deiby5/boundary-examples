import type { CvProfile } from "./schema.js";

export const sampleProfiles: CvProfile[] = [
  {
    profile_id: "sample-001",
    full_name: "Maya Ellison",
    target_role: "Senior Full-Stack Engineer",
    location: "Manchester, United Kingdom",
    email: "maya.ellison@example.com",
    phone: "+44 7000 100001",
    links: {
      linkedin: "linkedin.com/in/maya-ellison",
      github: "github.com/maya-ellison",
      portfolio: "mayaellison.dev",
    },
    summary:
      "Senior full-stack engineer with eight years of experience building customer-facing SaaS platforms, internal workflow tools, and data-rich dashboards. Strong track record leading React and Node.js delivery, improving reliability, and mentoring engineers in pragmatic testing and observability practices.",
    skills: {
      languages: ["TypeScript", "JavaScript", "Python", "SQL"],
      frameworks: ["React", "Next.js", "Node.js", "Express", "FastAPI"],
      cloud_tools: ["AWS", "Docker", "Terraform", "GitHub Actions", "Datadog"],
      databases: ["PostgreSQL", "Redis", "DynamoDB"],
      practices: ["CI/CD", "Test automation", "Observability", "Agile delivery"],
    },
    experience: [
      {
        company: "Northstar Ledger",
        role: "Senior Full-Stack Engineer",
        location: "Manchester, United Kingdom",
        start: "2021-03",
        end: "Present",
        bullets: [
          "Led the rebuild of a billing operations portal, reducing manual finance review time by 38% while improving auditability for enterprise customers.",
          "Designed a shared React component library and API client patterns that shortened feature delivery cycles across three product squads.",
          "Introduced contract tests and deployment health checks that reduced customer-impacting regressions during weekly releases.",
        ],
        technologies: ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS"],
      },
      {
        company: "Brightlane Systems",
        role: "Software Engineer",
        location: "Leeds, United Kingdom",
        start: "2017-07",
        end: "2021-02",
        bullets: [
          "Built workflow automation services that processed more than 2 million task events each month for operations teams.",
          "Improved API latency by refactoring high-volume endpoints and adding targeted Redis caching for common dashboard queries.",
          "Partnered with product managers and designers to deliver accessible analytics views used daily by support and account teams.",
        ],
        technologies: ["JavaScript", "Express", "Redis", "PostgreSQL", "Docker"],
      },
    ],
    projects: [
      {
        name: "Incident Review Hub",
        description:
          "Created an internal review tool that links deploys, alerts, and customer tickets so engineering managers can run faster post-incident analysis.",
        technologies: ["Next.js", "Datadog", "PostgreSQL"],
      },
      {
        name: "Usage Forecasting Dashboard",
        description:
          "Built a dashboard that combines customer usage trends and billing metrics to help account teams identify expansion opportunities.",
        technologies: ["React", "Python", "AWS"],
      },
    ],
    education: [
      {
        degree: "BSc Computer Science",
        institution: "Pennine Technical University",
        year: 2016,
        details: "Final-year project in distributed task scheduling",
      },
    ],
    certifications: ["AWS Certified Developer - Associate"],
  },
  {
    profile_id: "sample-002",
    full_name: "Jonas Reed",
    target_role: "Cloud Platform Engineer",
    location: "Austin, United States",
    email: "jonas.reed@example.com",
    phone: "+1 512 555 0184",
    links: {
      linkedin: "linkedin.com/in/jonas-reed",
      github: "github.com/jonas-reed",
    },
    summary:
      "Cloud platform engineer focused on reliable Kubernetes infrastructure, developer enablement, and secure cloud automation. Experienced in building reusable Terraform modules, improving delivery pipelines, and partnering with application teams to reduce operational friction.",
    skills: {
      languages: ["Go", "Python", "Bash", "SQL"],
      frameworks: ["gRPC", "FastAPI", "Flask"],
      cloud_tools: ["GCP", "Kubernetes", "Terraform", "Helm", "Prometheus", "Argo CD"],
      databases: ["PostgreSQL", "BigQuery", "Cloud SQL"],
      practices: ["Infrastructure as code", "SRE", "Incident response", "Security hardening"],
    },
    experience: [
      {
        company: "Cedarbyte Labs",
        role: "Cloud Platform Engineer",
        location: "Austin, United States",
        start: "2020-09",
        end: "Present",
        bullets: [
          "Built a standardized Kubernetes landing zone that helped seven product teams ship services with consistent logging, alerting, and network policy.",
          "Created Terraform modules for core cloud services, reducing new environment provisioning from several days to under one hour.",
          "Improved deployment reliability by adding progressive rollout workflows, automated rollback checks, and production readiness gates.",
        ],
        technologies: ["GCP", "Kubernetes", "Terraform", "Argo CD", "Prometheus"],
      },
      {
        company: "Metrogrid Analytics",
        role: "DevOps Engineer",
        location: "Denver, United States",
        start: "2016-05",
        end: "2020-08",
        bullets: [
          "Maintained CI/CD pipelines for data products and reduced average build time by 42% through caching and parallel test execution.",
          "Automated database backup checks and disaster recovery exercises for production PostgreSQL and BigQuery workloads.",
          "Worked with security engineers to implement least-privilege service accounts and container image scanning across delivery pipelines.",
        ],
        technologies: ["Python", "Docker", "PostgreSQL", "GitLab CI", "BigQuery"],
      },
    ],
    projects: [
      {
        name: "Developer Sandbox Platform",
        description:
          "Designed self-service ephemeral environments that let engineers test service changes against realistic dependencies before opening pull requests.",
        technologies: ["Kubernetes", "Terraform", "Go"],
      },
      {
        name: "Reliability Scorecards",
        description:
          "Implemented service scorecards that combine SLO attainment, alert noise, ownership metadata, and deployment health for leadership reviews.",
        technologies: ["Prometheus", "Python", "BigQuery"],
      },
    ],
    education: [
      {
        degree: "BS Information Systems",
        institution: "Lone Star Institute of Technology",
        year: 2015,
      },
    ],
    certifications: ["Google Professional Cloud DevOps Engineer", "Certified Kubernetes Administrator"],
  },
];
