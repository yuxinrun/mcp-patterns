<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { lang } = useData()
const en = computed(() => lang.value.startsWith('en'))

const zhSteps = [
  { n: '01', title: '未授权请求', desc: 'MCP 请求没有 token，服务端返回 401 + resource metadata 地址。', tone: 'coral' },
  { n: '02', title: '发现授权服务器', desc: '客户端读取 RFC 9728 元数据，找到 AS 与支持的 scopes。', tone: 'blue' },
  { n: '03', title: 'PKCE 授权', desc: '浏览器完成 OAuth 2.1 授权码 + PKCE，用户明确同意。', tone: 'teal' },
  { n: '04', title: '换取 Token', desc: 'token 的 audience 必须是当前 MCP resource，不能透传给下游。', tone: 'coral' },
  { n: '05', title: '带 Bearer 调用', desc: '服务端校验签名、issuer、audience、scope，再注入租户上下文。', tone: 'teal' }
]

const enSteps = [
  { n: '01', title: 'Unauthorized request', desc: 'The MCP request has no token; the server returns 401 plus its resource metadata URL.', tone: 'coral' },
  { n: '02', title: 'Discover the AS', desc: 'The client reads RFC 9728 metadata to find the authorization server and scopes.', tone: 'blue' },
  { n: '03', title: 'PKCE grant', desc: 'The browser completes the OAuth 2.1 authorization code flow with PKCE and explicit consent.', tone: 'teal' },
  { n: '04', title: 'Exchange token', desc: 'The token audience must be this MCP resource. Never pass it through downstream.', tone: 'coral' },
  { n: '05', title: 'Call with Bearer', desc: 'The server verifies signature, issuer, audience, and scope, then injects tenant context.', tone: 'teal' }
]

const steps = computed(() => (en.value ? enSteps : zhSteps))
</script>

<template>
  <div class="af">
    <div class="af-flow">
      <div v-for="(s, i) in steps" :key="s.n" class="af-step" :class="`tone-${s.tone}`">
        <span class="af-n">{{ s.n }}</span>
        <strong>{{ s.title }}</strong>
        <p>{{ s.desc }}</p>
        <span v-if="i < steps.length - 1" class="af-arrow">→</span>
      </div>
    </div>
    <div class="af-foot">
      <span>OAuth 2.1</span>
      <span>RFC 8707 resource</span>
      <span>RFC 9728 metadata</span>
      <span>PKCE</span>
      <span>audience validation</span>
    </div>
  </div>
</template>

<style scoped>
.af {
  margin: 28px 0;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background:
    radial-gradient(ellipse 50% 80% at 100% 0%, var(--coral-soft), transparent 60%),
    var(--panel);
}

.af-flow {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.af-step {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 15px 13px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel-2);
}

.af-step.tone-teal {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
}

.af-step.tone-coral {
  border-color: color-mix(in srgb, var(--coral) 32%, var(--line));
}

.af-step.tone-blue {
  border-color: color-mix(in srgb, var(--blue) 32%, var(--line));
}

.af-n {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.af-step strong {
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.3;
}

.af-step p {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}

.af-arrow {
  position: absolute;
  right: -11px;
  top: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-top: -9px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--panel);
  color: var(--faint);
  font-size: 10px;
}

.af-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}

.af-foot span {
  padding: 3px 8px;
  border-radius: 5px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.03em;
}

@media (max-width: 900px) {
  .af-flow {
    grid-template-columns: 1fr;
  }

  .af-arrow {
    right: auto;
    left: 50%;
    top: auto;
    bottom: -14px;
    transform: rotate(90deg);
  }

  .af-step {
    padding: 14px 16px;
  }
}
</style>
