import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import HeroDiagram from './components/HeroDiagram.vue'
import McpArch from './components/McpArch.vue'
import RatingBars from './components/RatingBars.vue'
import SpecTimeline from './components/SpecTimeline.vue'
import AuthFlow from './components/AuthFlow.vue'
import BrandMark from './components/BrandMark.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-image': () => h(HeroDiagram),
      'home-hero-info-before': () => h(BrandMark, { variant: 'pill' })
    })
  },
  enhanceApp({ app }) {
    app.component('BrandMark', BrandMark)
    app.component('McpArch', McpArch)
    app.component('RatingBars', RatingBars)
    app.component('SpecTimeline', SpecTimeline)
    app.component('AuthFlow', AuthFlow)
  }
}
