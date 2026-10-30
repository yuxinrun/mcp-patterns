<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { lang } = useData()
const en = computed(() => lang.value.startsWith('en'))

const hosts = ['Claude Code', 'Cursor', 'Dify', 'LangGraph']
const tools = ['tools', 'resources', 'prompts']
</script>

<template>
  <div class="hd" aria-hidden="true">
    <div class="hd-halo"></div>

    <div class="hd-node hd-host">
      <span class="hd-label">HOST / AGENT</span>
      <div class="hd-chips">
        <span v-for="host in hosts" :key="host">{{ host }}</span>
      </div>
    </div>

    <div class="hd-wire">
      <i></i><i></i><i></i>
      <span>JSON-RPC 2.0</span>
    </div>

    <div class="hd-node hd-client">
      <div>
        <span class="hd-label">MCP CLIENT</span>
        <strong>{{ en ? 'Connect · negotiate · relay' : '连接 · 协商 · 转发' }}</strong>
      </div>
      <span class="hd-dot"></span>
    </div>

    <div class="hd-wire hd-wire-alt">
      <i></i><i></i><i></i>
      <span>stdio / Streamable HTTP</span>
    </div>

    <div class="hd-node hd-server">
      <div class="hd-server-head">
        <span class="hd-label">MCP SERVER</span>
        <span class="hd-status"><b></b>ready</span>
      </div>
      <div class="hd-tools">
        <span v-for="tool in tools" :key="tool">{{ tool }}</span>
      </div>
      <div class="hd-guard">
        <span>auth</span><span>tenant</span><span>trace</span><span>audit</span>
      </div>
    </div>

    <div class="hd-foot">
      <span>{{ en ? 'Auth stays server-side' : '权限在服务端收口' }}</span>
      <span>{{ en ? 'Replayable logs' : '日志可回放' }}</span>
      <span>{{ en ? 'Failures are traceable' : '失败可定位' }}</span>
    </div>
  </div>
</template>

<style scoped>
.hd {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: min(100%, 470px);
  margin-inline: auto;
  padding: 28px 26px 22px;
  border: 1px solid var(--line);
  border-radius: 28px;
  background:
    radial-gradient(ellipse 80% 60% at 80% 0%, var(--accent-soft), transparent 60%),
    var(--panel);
  box-shadow: var(--shadow-lg);
  transform: rotate(-1.4deg);
}

.hd::after {
  content: '';
  position: absolute;
  inset: 10px;
  border: 1px dashed var(--line);
  border-radius: 20px;
  pointer-events: none;
}

.hd-halo {
  position: absolute;
  right: -34px;
  top: -30px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: radial-gradient(circle, var(--coral-soft), transparent 65%);
  filter: blur(2px);
}

.hd-node {
  position: relative;
  z-index: 1;
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  background: var(--panel);
}

.hd-label {
  display: block;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--muted);
}

.hd-host {
  padding: 16px 18px;
}

.hd-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}

.hd-chips span {
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 600;
}

.hd-wire {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 0 9px;
}

.hd-wire i {
  width: 1.5px;
  height: 5px;
  border-radius: 2px;
  background: var(--line-strong);
}

.hd-wire span {
  margin-top: 2px;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel-2);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.04em;
}

.hd-client {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-inline: 26px;
  padding: 14px 18px;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  background: linear-gradient(120deg, var(--accent-soft), transparent 70%), var(--panel);
}

.hd-client strong {
  display: block;
  margin-top: 3px;
  font-size: 13px;
  font-weight: 700;
}

.hd-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 5px var(--accent-soft);
}

.hd-server {
  padding: 16px 18px 15px;
  border-color: color-mix(in srgb, var(--coral) 38%, var(--line));
}

.hd-server-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hd-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--accent);
}

.hd-status b {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: hd-blink 2.4s infinite;
}

.hd-tools {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 12px;
}

.hd-tools span {
  padding: 9px 6px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel-2);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 9.5px;
  text-align: center;
}

.hd-guard {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 9px;
}

.hd-guard span {
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--coral-soft);
  color: var(--coral);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.04em;
}

.hd-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  color: var(--faint);
  font-size: 10px;
}

.hd-foot span::before {
  content: '•';
  margin-right: 5px;
  color: var(--accent);
}

@keyframes hd-blink {
  50% {
    opacity: 0.3;
  }
}

@media (max-width: 960px) {
  .hd {
    transform: none;
    margin-top: 12px;
  }
}

@media (max-width: 480px) {
  .hd {
    padding: 20px 18px 18px;
    border-radius: 20px;
  }

  .hd-client {
    margin-inline: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hd-status b {
    animation: none;
  }
}
</style>
