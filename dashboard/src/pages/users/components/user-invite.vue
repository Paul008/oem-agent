<script setup lang="ts">
import { MailPlus } from 'lucide-vue-next'

import { Modal, ModalClose, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle, ModalTrigger, useModal } from '@/components/prop-ui/modal'
import { Button } from '@/components/ui/button'

import UserInviteForm from './user-invite-form.vue'

const emit = defineEmits<{
  invited: []
}>()

const { isDesktop } = useModal()
const isOpen = ref(false)

function onSuccess() {
  isOpen.value = false
  emit('invited')
}
</script>

<template>
  <Modal v-model:open="isOpen">
    <ModalTrigger as-child>
      <Button variant="outline">
        <MailPlus />
        Invite User
      </Button>
    </ModalTrigger>

    <ModalContent>
      <ModalHeader>
        <ModalTitle as-child>
          <div class="flex items-center gap-2">
            <MailPlus />
            <span>Invite User</span>
          </div>
        </ModalTitle>
        <ModalDescription>
          Invite a new user by sending them a magic link email. Assign a role to define their access level.
        </ModalDescription>
      </ModalHeader>

      <UserInviteForm @success="onSuccess" />

      <ModalFooter v-if="!isDesktop" class="pt-2">
        <ModalClose as-child>
          <Button variant="outline">
            Cancel
          </Button>
        </ModalClose>
      </ModalFooter>
    </ModalContent>
  </Modal>
</template>
