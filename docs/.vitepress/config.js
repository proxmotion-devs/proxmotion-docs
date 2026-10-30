import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Proxmotion',
  description: 'Multi-Tenant VPS Management Panel for Proxmox VE',
  base: '/proxmotion-docs/',
  ignoreDeadLinks: true,
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'VM Templates', link: '/guide/templates-linux-images' },
      { text: 'Integrations', link: '/integrations/whmcs' },
      { text: 'API Reference', link: '/api/v1' },
      { text: 'Architecture (ADR)', link: '/adr/0051-snapshots-and-backups' },
      { text: 'v0.1', link: 'https://github.com/proxmotion-devs/proxmotion/pull/42' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Proxmotion?', link: '/guide/introduction' },
            { text: 'Architecture & Concepts', link: '/guide/concepts' },
            { text: 'Getting Started', link: '/guide/getting-started' }
          ]
        },
        {
          text: 'Building VM Templates',
          items: [
            { text: 'Linux Cloud Images', link: '/guide/templates-linux-images' },
            { text: 'Windows Server (Sysprep/Cloudbase)', link: '/guide/templates-windows' },
            { text: 'Custom Installer ISOs', link: '/guide/templates-iso' },
            { text: 'FreeBSD Templates', link: '/guide/templates-freebsd' }
          ]
        },
        {
          text: 'Core Features (v0.1)',
          items: [
            { text: 'SSH Keys Management', link: '/guide/ssh-keys' },
            { text: 'Snapshots Management', link: '/guide/snapshots' },
            { text: 'Backups Management', link: '/guide/backups' },
            { text: 'Usage & History', link: '/guide/usage-history' },
            { text: 'Guest Scripts & Lifecycle Hooks', link: '/guide/guest-scripts' },
            { text: 'App Recipes & Marketplace', link: '/guide/app-recipes' }
          ]
        }
      ],
      '/integrations/': [
        {
          text: 'Billing Integrations',
          items: [
            { text: 'WHMCS Module', link: '/integrations/whmcs' },
            { text: 'WISECP Module', link: '/integrations/wisecp' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'REST API',
          items: [
            { text: 'Billing API v1 Overview', link: '/api/v1' },
            { text: 'SSH Keys API', link: '/api/ssh-keys' },
            { text: 'Snapshots API', link: '/api/snapshots' },
            { text: 'Backups API', link: '/api/backups' },
            { text: 'Usage API', link: '/api/usage' }
          ]
        }
      ],
      '/adr/': [
        {
          text: 'Architecture Decisions (ADR)',
          items: [
            { text: 'ADR 0049: SSH Keys on Running Servers', link: '/adr/0049-ssh-keys-on-running-servers' },
            { text: 'ADR 0050: Usage History', link: '/adr/0050-usage-history' },
            { text: 'ADR 0051: Snapshots and Backups', link: '/adr/0051-snapshots-and-backups' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/proxmotion-devs/proxmotion' }
    ],
    footer: {
      message: 'Released under the AGPL-3.0 License.',
      copyright: 'Copyright © 2026 Proxmotion Devs'
    }
  }
})
