<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { lang } = useData()
const en = computed(() => lang.value.startsWith('en'))
</script>

<template>
  <div class="arch">
    <div class="arch-col">
      <span class="arch-kicker">01 / HOST</span>
      <strong>Agent / IDE / App</strong>
      <p>{{ en ? 'Owns user consent, context, and the final decision' : '负责用户授权、上下文与最终决策' }}</p>
    </div>
    <div class="arch-link"><span>JSON-RPC</span></div>
    <div class="arch-col arch-client">
      <span class="arch-kicker">02 / CLIENT</span>
      <strong>MCP Client</strong>
      <p>{{ en ? 'Maintains the connection, negotiates capabilities, relays messages' : '维护连接、能力协商、转发请求与通知' }}</p>
    </div>
    <div class="arch-link arch-link-alt"><span>transport</span></div>
    <div class="arch-col arch-server">
      <span class="arch-kicker">03 / SERVER</span>
      <strong>MCP Server</strong>
      <p>{{ en ? 'Runs business logic and owns auth, tenancy, and audit' : '执行业务逻辑，收口鉴权、租户与审计' }}</p>
    </div>
    <div class="arch-link"><span>call</span></div>
    <div class="arch-col arch-tools">
      <span class="arch-kicker">04 / CAPABILITY</span>
      <strong>Tools · Resources · Prompts</strong>
      <p>{{ en ? 'Real capability: databases, files, APIs, local commands' : '数据库、文件、API、本地命令等真实能力' }}</p>
    </div>
  </div>
</template>

<style scoped>
.arch {
  display: grid;
  grid-template-columns: 1fr 30px 1fr 30px 1fr 30px 1fr;
  align-items: stretch;
  gap: 0;
  margin: 28px 0;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background:
    radial-gradient(ellipse 60% 90% at 0% 0%, var(--accent-soft), transparent 55%),
    var(--panel);
}

.arch-col {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 16px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel-2);
}

.arch-kicker {
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.arch-col strong {
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.01em;
}

.arch-col p {
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.5;
}

.arch-client {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  background: linear-gradient(150deg, var(--accent-soft), transparent 70%), var(--panel-2);
}

.arch-server {
  border-color: color-mix(in srgb, var(--coral) 38%, var(--line));
}

.arch-tools {
  border-color: color-mix(in srgb, var(--blue) 38%, var(--line));
}

.arch-link {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.arch-link::before {
  content: '';
  width: 100%;
  border-top: 1.5px dashed var(--line-strong);
}

.arch-link::after {
  content: '';
  position: absolute;
  right: 1px;
  width: 5px;
  height: 5px;
  border-top: 1.5px solid var(--line-strong);
  border-right: 1.5px solid var(--line-strong);
  transform: rotate(45deg);
}

.arch-link span {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 2px 5px;
  background: var(--panel);
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7.5px;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .arch {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 18px;
  }

  .arch-link {
    height: 26px;
  }

  .arch-link::before {
    width: 1.5px;
    height: 100%;
    border-top: 0;
    border-left: 1.5px dashed var(--line-strong);
  }

  .arch-link::after {
    right: auto;
    bottom: 1px;
    transform: rotate(135deg);
  }
}
</style>
