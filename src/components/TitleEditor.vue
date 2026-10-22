<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

defineProps<{ modelValue: string }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  finish: [cancel?: boolean]
}>()
const input = ref<HTMLInputElement | null>(null)
onMounted(async () => {
  await nextTick()
  input.value?.focus()
  input.value?.select()
})

function keydown(event: KeyboardEvent) {
  // Enter used to confirm a Chinese IME candidate must not save the block.
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('finish', event.key === 'Escape')
  }
}
</script>

<template>
  <input
    ref="input"
    class="title-input"
    aria-label="时间块标题"
    placeholder="这段时间，想做什么？"
    :value="modelValue"
    autocomplete="off"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @pointerdown.stop
    @keydown="keydown"
    @blur="emit('finish')"
  />
</template>
