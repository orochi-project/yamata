// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ["@nuxt/eslint", "@nuxt/ui", "@pinia/nuxt"],

  devtools: {
    enabled: true,
  },

  css: ["~/assets/css/main.css"],

  routeRules: {
    "/": { prerender: true },
  },

  compatibilityDate: "2026-06-30",

  eslint: {
    config: {
      stylistic: {
        commaDangle: "never",
        braceStyle: "1tbs",
      },
    },
  },

  typescript: {
    tsConfig: {
      compilerOptions: {
        types: ["wicg-file-system-access"],
      },
    },
  },

  icon: {
    clientBundle: {
      icons: [
        "lucide:circle",
        "lucide:rectangle-horizontal",
        "lucide:diamond",
        "lucide:arrow-left",
        "lucide:arrow-right",
        "lucide:arrow-up",
        "lucide:arrow-down",
        "lucide:grid-3x3",
        "lucide:play",
        "lucide:pause",
        "lucide:undo-2",
        "lucide:redo-2",
        "lucide:trash-2",
        "lucide:music-2",
        "lucide:plus",
        "lucide:minus",
        "lucide:asterisk",
        "simple-icons:github",
      ],
    },
  },
});
