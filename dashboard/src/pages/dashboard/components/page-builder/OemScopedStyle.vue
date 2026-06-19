<script lang="ts">
import { h } from 'vue'

export default {
  props: {
    css: {
      type: String,
      required: true,
    },
    sectionId: {
      type: String,
      required: true,
    },
  },
  setup(props: { css: string, sectionId: string }) {
    return () => h('style', {
      'data-section-id': props.sectionId,
    }, props.css)
  },
}
</script>
