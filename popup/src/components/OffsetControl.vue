<script setup>

</script>

<template>
  <v-number-input
    :reverse="false"
    controlVariant="hidden"
    label="Chat offset (seconden)"
    :hideInput="false"
    hidden
    :inset="false"
></v-number-input>

<!-- Correcte offset feedback -->
<h3>Klopt de voorgestelde offset?</h3>
<v-btn>Ja</v-btn>
<v-btn>Nee</v-btn>
</template>

<style scoped>

</style>
