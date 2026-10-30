<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

type Transport = 'stdio' | 'http' | 'sse'
type Row = { label: string; hint: string; scores: Record<Transport, number> }

const { lang } = useData()
const en = computed(() => lang.value.startsWith('en'))

const transports: { id: Transport; label: string }[] = [
  { id: 'stdio', label: 'stdio' },
  { id: 'http', label: 'Streamable HTTP' },
  { id: 'sse', label: 'Legacy SSE' }
]

const zhRows: Row[] = [
  { label: '本地开发体验', hint: '起进程即可连，无需端口', scores: { stdio: 5, http: 3, sse: 2 } },
  { label: '远程部署', hint: '过网关、负载均衡、水平扩容', scores: { stdio: 1, http: 5, sse: 3 } },
  { label: '鉴权与审计', hint: 'OAuth 2.1、租户、审计闭环', scores: { stdio: 1, http: 5, sse: 3 } },
  { label: '流式与长任务', hint: '进度、增量结果、断点恢复', scores: { stdio: 2, http: 4, sse: 4 } },
  { label: '多客户端共享', hint: '一个服务实例服务多个 Host', scores: { stdio: 1, http: 5, sse: 3 } }
]

const enRows: Row[] = [
  { label: 'Local development', hint: 'Spawn a process, no port needed', scores: { stdio: 5, http: 3, sse: 2 } },
  { label: 'Remote deployment', hint: 'Gateways, load balancers, horizontal scale', scores: { stdio: 1, http: 5, sse: 3 } },
  { label: 'Auth and audit', hint: 'OAuth 2.1, tenancy, audit trail', scores: { stdio: 1, http: 5, sse: 3 } },
  { label: 'Streaming and long tasks', hint: 'Progress, incremental results, resume', scores: { stdio: 2, http: 4, sse: 4 } },
  { label: 'Shared by clients', hint: 'One instance serves many hosts', scores: { stdio: 1, http: 5, sse: 3 } }
]

const rows = computed(() => (en.value ? enRows : zhRows))
</script>

<template>
  <figure class="rb">
    <div class="rb-head">
      <div class="rb-legend">
        <span v-for="t in transports" :key="t.id" :class="`rb-${t.id}`">
          <i></i>{{ t.label }}
        </span>
      </div>
      <figcaption>{{ en ? 'Engineering fit · 5 = best' : '工程体感评分 · 5 = 更适合' }}</figcaption>
    </div>

    <div class="rb-rows">
      <div v-for="row in rows" :key="row.label" class="rb-row">
        <div class="rb-label">
          <strong>{{ row.label }}</strong>
          <span>{{ row.hint }}</span>
        </div>
        <div class="rb-bars">
          <div v-for="t in transports" :key="t.id" class="rb-line">
            <span class="rb-name">{{ t.label }}</span>
            <div class="rb-track">
              <i :class="`rb-${t.id}`" :style="{ width: `${(row.scores[t.id] / 5) * 100}%` }"></i>
            </div>
            <b>{{ row.scores[t.id] }}</b>
          </div>
        </div>
      </div>
    </div>

    <p class="rb-note">
      {{
        en
          ? 'These are engineering trade-offs, not protocol rankings. Default new projects to Streamable HTTP, prefer stdio for local tools, and keep Legacy SSE only for existing clients.'
          : '评分是工程取舍，不是协议优劣。新项目默认选 Streamable HTTP；本地工具优先 stdio；Legacy SSE 只用于兼容存量客户端。'
      }}
    </p>
  </figure>
</template>

<style scoped>
.rb {
  margin: 26px 0;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--panel);
}

.rb-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--line);
}

.rb-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.rb-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.03em;
}

.rb-legend i {
  width: 18px;
  height: 4px;
  border-radius: 2px;
}

.rb-legend .rb-stdio i,
.rb-stdio {
  background: var(--accent);
}

.rb-legend .rb-http i,
.rb-http {
  background: var(--coral);
}

.rb-legend .rb-sse i,
.rb-sse {
  background: var(--blue);
}

.rb figcaption {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.05em;
}

.rb-rows {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 0 4px;
}

.rb-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 24px;
  align-items: center;
}

.rb-label strong {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.rb-label span {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.45;
}

.rb-bars {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.rb-line {
  display: grid;
  grid-template-columns: 104px 1fr 18px;
  gap: 10px;
  align-items: center;
}

.rb-name {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
  white-space: nowrap;
}

.rb-track {
  height: 7px;
  border-radius: 999px;
  background: var(--panel-3);
  overflow: hidden;
}

.rb-track i {
  display: block;
  height: 100%;
  border-radius: 999px;
  opacity: 0.9;
}

.rb-line b {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
}

.rb-note {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .rb {
    padding: 18px;
  }

  .rb-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .rb-line {
    grid-template-columns: 94px 1fr 16px;
  }
}
</style>
