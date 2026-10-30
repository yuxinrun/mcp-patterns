<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

withDefaults(defineProps<{ variant?: 'pill' | 'card' }>(), { variant: 'pill' })

const { lang } = useData()
const en = computed(() => lang.value.startsWith('en'))
</script>

<template>
  <div :class="['mp-brand', `mp-brand--${variant}`]">
    <img
      :src="withBase('/yuxin-run.png')"
      :alt="en ? 'Yuxin Runs: a running teal fish with headphones' : '鱼心快跑：戴着耳机奔跑的青色小鱼'"
      width="546"
      height="363"
    />
    <div class="mp-brand-copy">
      <strong>{{ en ? 'Yuxin Runs' : '鱼心快跑' }}</strong>
      <span>{{ en ? 'Run, Yuxin, run. Bugs cannot catch you.' : '鱼心快跑，Bug 追不上' }}</span>
    </div>
  </div>
</template>
