import { defineConfig } from 'vitepress'

const repo = 'https://github.com/yuxinrun/mcp-patterns'
const sisterSite = 'https://how-to-build-better-agents.yuxin.run/'
const base = process.env.BASE ?? '/'

const zhSidebar = [
  {
    text: '开始',
    collapsed: false,
    items: [
      { text: '什么是 MCP', link: '/guide/what-is-mcp' },
      { text: 'MCP vs Skill vs Agent', link: '/guide/mcp-vs-skill-agent' },
      { text: '生态地图 2026', link: '/ecosystem/landscape' }
    ]
  },
  {
    text: 'Server 开发',
    collapsed: false,
    items: [
      { text: '标准项目模板', link: '/server/quickstart' },
      { text: 'stdio Server Demo', link: '/server/stdio' },
      { text: 'HTTP / SSE Server Demo', link: '/server/http-sse' },
      { text: '工具设计模式', link: '/server/tool-design' }
    ]
  },
  {
    text: '工程模式',
    collapsed: false,
    items: [
      { text: '鉴权与权限控制', link: '/engineering/auth' },
      { text: '多租户隔离', link: '/engineering/multi-tenant' },
      { text: '参数校验与错误处理', link: '/engineering/validation-errors' },
      { text: '日志与可观测', link: '/engineering/observability' }
    ]
  },
  {
    text: '实战案例',
    collapsed: false,
    items: [
      { text: '文件服务', link: '/recipes/filesystem' },
      { text: '数据库查询', link: '/recipes/database' },
      { text: 'API 代理', link: '/recipes/api-proxy' },
      { text: '本地工具封装', link: '/recipes/local-tools' }
    ]
  },
  {
    text: '调试排坑',
    collapsed: false,
    items: [{ text: '常见问题排查', link: '/debugging/troubleshooting' }]
  },
  {
    text: 'Skill Hub',
    collapsed: false,
    items: [{ text: '私有 Skill Hub 与注册发现', link: '/hub/skill-hub' }]
  },
  {
    text: '框架对接',
    collapsed: false,
    items: [
      { text: 'LangGraph / LangChain', link: '/integrations/langgraph' },
      { text: 'CrewAI', link: '/integrations/crewai' },
      { text: 'Dify', link: '/integrations/dify' }
    ]
  },
  {
    text: '关于',
    collapsed: false,
    items: [{ text: '关于本站', link: '/about' }]
  }
]

const enSidebar = [
  {
    text: 'Start',
    collapsed: false,
    items: [
      { text: 'What is MCP', link: '/en/guide/what-is-mcp' },
      { text: 'MCP vs Skills vs Agents', link: '/en/guide/mcp-vs-skill-agent' },
      { text: 'Ecosystem 2026', link: '/en/ecosystem/landscape' }
    ]
  },
  {
    text: 'Server Development',
    collapsed: false,
    items: [
      { text: 'Project template', link: '/en/server/quickstart' },
      { text: 'stdio server demo', link: '/en/server/stdio' },
      { text: 'HTTP / SSE server demo', link: '/en/server/http-sse' },
      { text: 'Tool design patterns', link: '/en/server/tool-design' }
    ]
  },
  {
    text: 'Engineering',
    collapsed: false,
    items: [
      { text: 'Auth & permissions', link: '/en/engineering/auth' },
      { text: 'Multi-tenancy', link: '/en/engineering/multi-tenant' },
      { text: 'Validation & errors', link: '/en/engineering/validation-errors' },
      { text: 'Logging & observability', link: '/en/engineering/observability' }
    ]
  },
  {
    text: 'Recipes',
    collapsed: false,
    items: [
      { text: 'Examples overview', link: '/en/recipes/' },
      { text: 'Filesystem', link: '/en/recipes/filesystem' },
      { text: 'Database', link: '/en/recipes/database' },
      { text: 'API proxy', link: '/en/recipes/api-proxy' },
      { text: 'Local tools', link: '/en/recipes/local-tools' }
    ]
  },
  {
    text: 'Debug',
    collapsed: false,
    items: [{ text: 'Troubleshooting', link: '/en/debugging/troubleshooting' }]
  },
  {
    text: 'Skills',
    collapsed: false,
    items: [{ text: 'Private Skill Hub', link: '/en/hub/skill-hub' }]
  },
  {
    text: 'Integrations',
    collapsed: false,
    items: [
      { text: 'LangGraph / LangChain', link: '/en/integrations/langgraph' },
      { text: 'CrewAI', link: '/en/integrations/crewai' },
      { text: 'Dify', link: '/en/integrations/dify' }
    ]
  },
  {
    text: 'About',
    collapsed: false,
    items: [{ text: 'About', link: '/en/about' }]
  }
]

const zhNav = [
  { text: '基础', link: '/guide/what-is-mcp', activeMatch: '/guide/' },
  { text: 'Server', link: '/server/quickstart', activeMatch: '/server/' },
  { text: '工程模式', link: '/engineering/auth', activeMatch: '/engineering/' },
  { text: '实战', link: '/recipes/filesystem', activeMatch: '/recipes/' },
  { text: '生态', link: '/ecosystem/landscape', activeMatch: '/ecosystem/' },
  {
    text: '更多',
    items: [
      { text: '调试排坑', link: '/debugging/troubleshooting' },
      { text: 'Skill Hub', link: '/hub/skill-hub' },
      { text: '框架对接', link: '/integrations/langgraph' },
      { text: '关于本站', link: '/about' },
      { text: '姊妹站：构建更好的 Agent ↗', link: sisterSite, target: '_blank', rel: 'noopener' }
    ]
  }
]

const enNav = [
  { text: 'Basics', link: '/en/guide/what-is-mcp', activeMatch: '/en/guide/' },
  { text: 'Server', link: '/en/server/quickstart', activeMatch: '/en/server/' },
  { text: 'Engineering', link: '/en/engineering/auth', activeMatch: '/en/engineering/' },
  { text: 'Recipes', link: '/en/recipes/', activeMatch: '/en/recipes/' },
  { text: 'Ecosystem', link: '/en/ecosystem/landscape', activeMatch: '/en/ecosystem/' },
  {
    text: 'More',
    items: [
      { text: 'Troubleshooting', link: '/en/debugging/troubleshooting' },
      { text: 'Skill Hub', link: '/en/hub/skill-hub' },
      { text: 'Integrations', link: '/en/integrations/langgraph' },
      { text: 'About', link: '/en/about' },
      { text: 'Sister site: Better Agents ↗', link: sisterSite, target: '_blank', rel: 'noopener' }
    ]
  }
]

export default defineConfig({
  title: 'MCP Patterns',
  description: 'MCP Server 工程模式与实战手册：协议、传输、鉴权、多租户、调试、Skill Hub 与 Agent 框架对接。',
  base,
  lang: 'zh-CN',
  appearance: true,
  lastUpdated: true,
  metaChunk: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['meta', { name: 'theme-color', content: '#f6f4ee', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'theme-color', content: '#06100e', media: '(prefers-color-scheme: dark)' }],
    ['meta', { name: 'author', content: '鱼心快跑' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'MCP Patterns｜MCP Server 工程模式与实战手册' }],
    [
      'meta',
      {
        property: 'og:description',
        content: '写给后端与 AI 开发者的 MCP 落地指南。可运行代码、工程模式、避坑清单。'
      }
    ],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }]
  ],
  markdown: {
    theme: { light: 'github-dark', dark: 'github-dark' },
    lineNumbers: false,
    image: { lazyLoading: true }
  },
  themeConfig: {
    logo: { light: '/logo.svg', dark: '/logo-dark.svg' },
    siteTitle: 'MCP Patterns',
    nav: zhNav,
    sidebar: zhSidebar,
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新于', formatOptions: { dateStyle: 'short', timeStyle: 'short' } },
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: '在 GitHub 上编辑此页' },
    socialLinks: [{ icon: 'github', link: repo }],
    footer: {
      message: '以工程实践为主，代码优先，少堆理论。',
      copyright: '© 2026 鱼心快跑 · MCP Patterns'
    },
    search: {
      provider: 'local',
      options: {
        detailedView: true,
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            displayDetails: '显示详情',
            resetButtonTitle: '清除查询',
            backButtonTitle: '返回',
            noResultsText: '没有找到结果',
            footer: {
              selectText: '选择',
              selectKeyAriaLabel: '回车',
              navigateText: '切换',
              navigateUpKeyAriaLabel: '上箭头',
              navigateDownKeyAriaLabel: '下箭头',
              closeText: '关闭',
              closeKeyAriaLabel: 'Esc'
            }
          }
        }
      }
    },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    langMenuLabel: '切换语言',
    notFound: {
      title: '页面不存在',
      quote: '这个路由没有对应的 MCP 工具。回到首页重新发现。',
      linkText: '返回首页'
    }
  },
  locales: {
    root: { label: '简体中文', lang: 'zh-CN' },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'MCP Patterns',
      description: 'Engineering patterns and field notes for building MCP servers.',
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
        outline: { level: [2, 3], label: 'On this page' },
        docFooter: { prev: 'Previous', next: 'Next' },
        lastUpdated: { text: 'Updated', formatOptions: { dateStyle: 'short', timeStyle: 'short' } },
        editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
        footer: {
          message: 'Code first. Less theory, more shipped patterns.',
          copyright: '© 2026 Yuxin · MCP Patterns'
        },
        search: {
          provider: 'local',
          options: {
            detailedView: true,
            translations: {
              button: { buttonText: 'Search docs', buttonAriaLabel: 'Search docs' }
            }
          }
        },
        returnToTopLabel: 'Return to top',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
        langMenuLabel: 'Change language',
        notFound: {
          title: 'Page not found',
          quote: 'No MCP tool is registered for this route. Head back home.',
          linkText: 'Go home'
        }
      }
    }
  },
  transformHead({ pageData }) {
    const title = pageData.frontmatter.title
      ? `${pageData.frontmatter.title} | MCP Patterns`
      : 'MCP Patterns｜MCP Server 工程模式与实战手册'
    return [['meta', { property: 'og:title', content: title }]]
  }
})
