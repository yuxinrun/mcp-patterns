<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { lang } = useData()
const en = computed(() => lang.value.startsWith('en'))

const zhMilestones = [
  { date: '2024-11', title: 'MCP 首次发布', desc: 'stdio + HTTP/SSE 两种传输，工具、资源、提示三大原语。' },
  { date: '2025-03', title: 'Streamable HTTP', desc: '单端点替代双端点 SSE，引入 OAuth 2.1 授权基线。' },
  { date: '2025-06', title: '工程能力补齐', desc: '结构化输出、elicitation、资源链接、授权服务器分离。' },
  { date: '2025-11', title: '稳定版基线', desc: 'OAuth 资源指示符、任务与扩展机制逐步成型，生态爆发。' },
  { date: '2026-07', title: '无状态时代', desc: '移除协议层会话，server/discover、逐请求能力声明，SDK v2。' }
]

const enMilestones = [
  { date: '2024-11', title: 'MCP ships', desc: 'stdio + HTTP/SSE transports, plus tools, resources, and prompts.' },
  { date: '2025-03', title: 'Streamable HTTP', desc: 'One endpoint replaces dual SSE endpoints; OAuth 2.1 baseline.' },
  { date: '2025-06', title: 'Production features', desc: 'Structured output, elicitation, resource links, separate auth server.' },
  { date: '2025-11', title: 'Stable baseline', desc: 'Resource indicators, tasks, extensions mature; ecosystem takes off.' },
  { date: '2026-07', title: 'Stateless era', desc: 'Protocol sessions removed, server/discover, per-request capabilities, SDK v2.' }
]

const milestones = computed(() => (en.value ? enMilestones : zhMilestones))
</script>

<template>
  <div class="tl">
    <div class="tl-track">
      <div v-for="(m, i) in milestones" :key="m.date" class="tl-item" :class="{ latest: i === milestones.length - 1 }">
        <span class="tl-date">{{ m.date }}</span>
        <span class="tl-dot"><i></i></span>
        <strong>{{ m.title }}</strong>
        <p>{{ m.desc }}</p>
      </div>
    </div>
    <p class="tl-note">
      {{
        en
          ? 'Dates are spec revision dates, not SDK release dates. Confirm which revisions your client supports before production.'
          : '版本日期是规范修订日，不是 SDK 发布日期。生产接入前先确认客户端支持的协议修订。'
      }}
    </p>
  </div>
</template>

<style scoped>
.tl {
  margin: 28px 0;
  padding: 26px 24px 20px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--panel);
  overflow-x: auto;
}

.tl-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 18px;
  min-width: 780px;
  padding-top: 4px;
}

.tl-track::before {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  top: 37px;
  border-top: 1px dashed var(--line-strong);
}

.tl-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-right: 8px;
}

.tl-date {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.06em;
}

.tl-dot {
  display: flex;
  align-items: center;
  width: 12px;
  height: 12px;
  margin: 4px 0 3px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--panel);
}

.tl-dot i {
  width: 4px;
  height: 4px;
  margin-inline: auto;
  border-radius: 50%;
  background: var(--faint);
}

.tl-item.latest .tl-dot {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.tl-item.latest .tl-dot i {
  background: var(--accent);
}

.tl-item strong {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.tl-item.latest strong {
  color: var(--accent);
}

.tl-item p {
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.55;
}

.tl-note {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
  color: var(--faint);
  font-size: 10.5px;
  line-height: 1.5;
}

@media (max-width: 760px) {
  .tl {
    padding: 20px 18px 16px;
  }

  .tl-track {
    min-width: 0;
    grid-template-columns: 1fr;
    gap: 0;
  }

  .tl-track::before {
    left: 6px;
    right: auto;
    top: 10px;
    bottom: 10px;
    border-top: 0;
    border-left: 1px dashed var(--line-strong);
  }

  .tl-item {
    display: grid;
    grid-template-columns: 64px 16px 1fr;
    grid-template-rows: auto auto;
    column-gap: 10px;
    padding: 0 0 20px;
  }

  .tl-date {
    grid-column: 1;
    grid-row: 1;
    padding-top: 1px;
    text-align: right;
  }

  .tl-dot {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: start;
    margin-top: 1px;
  }

  .tl-item strong {
    grid-column: 3;
    grid-row: 1;
  }

  .tl-item p {
    grid-column: 3;
    grid-row: 2;
  }
}
</style>
