<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps<{ modelValue: string; suspended?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  finish: [cancel?: boolean]
}>()
const input = ref<HTMLInputElement | null>(null)
let selection: [number | null, number | null] = [null, null]
watch(() => props.suspended, async suspended => {
  if (suspended) {
    selection = [input.value?.selectionStart ?? null, input.value?.selectionEnd ?? null]
  } else {
    await nextTick()
    if (props.suspended) return
    input.value?.focus({ preventScroll: true })
    if (selection[0] !== null && selection[1] !== null) input.value?.setSelectionRange(selection[0], selection[1])
  }
})
onMounted(async () => {
  await nextTick()
  if (props.suspended) return
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
    @blur="!suspended && emit('finish')"
  />
</template>
