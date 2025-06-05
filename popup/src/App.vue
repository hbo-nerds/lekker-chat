<template>
  <v-app>
    <v-main>
      <h1 class="display-1">LekkerChat</h1>
      <OffsetControl />
    </v-main>
  </v-app>
</template>

<script>
import OffsetControl from './components/OffsetControl.vue'

export default {
  name: 'App',

  components: {
    OffsetControl,
  },

  data: () => ({
    //
  }),
}
</script>

<style>
  body {
    width: 25rem;
  }
</style>