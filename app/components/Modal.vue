<script setup lang="ts">
type ModalButton = {
  label: string;
  color?: "primary" | "secondary" | "success" | "error" | "warning" | "neutral";
  variant?: "solid" | "outline" | "soft" | "ghost" | "link";
  icon?: string;
  onClick?: () => any;
};

const props = defineProps<{
  title: string;
  message?: string;
  buttons: ModalButton[];
}>();

const emit = defineEmits<{
  close: [value?: unknown];
}>();

const loading = ref<string | null>(null);

async function handleClick(button: ModalButton) {
  try {
    loading.value = button.label;
    const result = await button.onClick?.();
    emit("close", result);
  } finally {
    loading.value = null;
  }
}
</script>

<template>
  <UModal :title="props.title">
    <template #body>
      <p v-if="props.message">
        {{ props.message }}
      </p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          v-for="button in props.buttons"
          :key="button.label"
          :color="button.color ?? 'primary'"
          :variant="button.variant ?? 'solid'"
          :icon="button.icon"
          :loading="loading === button.label"
          @click="handleClick(button)"
        >
          {{ button.label }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
