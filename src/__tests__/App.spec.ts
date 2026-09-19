import { expect, describe, it } from 'vitest'

import { mount } from '@vue/test-utils'
import BrandMark from '@/components/BrandMark.vue'

describe('BrandMark', () => {
  it('renders the product name accessibly', () => {
    const wrapper = mount(BrandMark)
    expect(wrapper.text()).toContain('Kindy')
    expect(wrapper.attributes('aria-label')).toBe('Kindy')
  })
})
