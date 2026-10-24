import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import EditItemModal from '../src/components/EditItemModal'

export async function run() {
  const results = []
  function scenario({ initial = 129.99, type = '%', value = '20', expected = 103.99, qty = 1, minimum = 0, typed }) {
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    let added
    const product = { name: 'Fixture', systemPrice: 149.99, minPrice: minimum, _cartPrice: initial, _cartQty: qty }
    const click = text => {
      const buttons = [...host.querySelectorAll('button')].filter(b => b.textContent.trim() === text)
      if (!buttons.length) throw new Error(`Missing button ${text}`)
      flushSync(() => buttons.at(-1).click())
    }
    try {
      flushSync(() => root.render(<EditItemModal product={product} onAdd={item => { added = item }} onCancel={() => {}} minPriceRestriction={minimum > 0} />))
      if (typed) for (const digit of typed) click(digit)
      click('% Discount'); click(type)
      for (const digit of value) click(digit)
      if (!host.textContent.includes(`New price: $${expected.toFixed(2)}`)) throw new Error('Discount preview used wrong base')
      click('Apply')
      if (host.querySelector('input').value !== expected.toFixed(2)) throw new Error('Applied price differs from preview')
      click('Add to Cart')
      if (minimum > expected) {
        if (added || !host.textContent.includes('Minimum price')) throw new Error('Minimum restriction bypassed')
      } else {
        if (added.salePrice !== expected || added.subtotal !== expected * qty || added.systemPrice !== 149.99) throw new Error('Incorrect cart payload')
        if (Math.abs(added.discount - Math.max(0, 149.99 - expected)) > 0.000001) throw new Error('System discount accounting changed')
      }
    } finally { root.unmount(); host.remove() }
  }
  scenario({}); results.push('reopened custom price: 129.99 minus 20% = 103.99; preview and saved item agree')
  scenario({ type: '$', expected: 109.99 }); results.push('fixed discount uses current price')
  scenario({ qty: 3 }); results.push('quantity multiplies discounted unit price')
  scenario({ initial: 149.99, expected: 119.99 }); results.push('unchanged system price still discounts normally')
  scenario({ initial: 149.99, typed: '129.99' }); results.push('price edited in modal becomes discount base immediately')
  scenario({ value: '200', expected: 0 }); results.push('discount cannot make unit price negative')
  scenario({ minimum: 110 }); results.push('minimum price restriction still blocks add')
  scenario({ initial: 103.99, expected: 83.19 }); results.push('subsequent discount uses latest price, not original catalog price')
  return results
}
