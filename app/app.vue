<script setup lang="ts">
import Modal from "~/components/Modal.vue";

const beatmapFile = useBeatmapFileStore();

const overlay = useOverlay();

useHead({
  meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
  link: [{ rel: "icon", href: "/favicon.ico" }],
  htmlAttrs: {
    lang: "en",
  },
});

const title = "Yamata";
const description = "The official beatmap editor for the Orochi rhythm game.";

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
});

onMounted(async () => {
  if (!beatmapFile.supported) {
    const modal = overlay.create(Modal);

    await modal.open({
      title: "Browser Restrictions",
      message:
        "Your browser does not support reading/writing directly to the file system. You can still manually import and save beatmaps.",
      buttons: [
        {
          label: "Understood!",
          color: "primary",
        },
      ],
    });

    return;
  }

  await beatmapFile.restoreHandle();
});
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
