import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'

import * as HostPopover from './popover'
import * as HostSlider from './slider'
import * as HostSpinner from './spinner'
import * as HostTabs from './tabs'

test('shared Tabs forwards vertical orientation to Base UI', () => {
  const html = renderToStaticMarkup(
    <HostTabs.Tabs defaultValue="overview" orientation="vertical">
      <HostTabs.TabsList>
        <HostTabs.TabsTrigger value="overview">Overview</HostTabs.TabsTrigger>
        <HostTabs.TabsTrigger value="activity">Activity</HostTabs.TabsTrigger>
      </HostTabs.TabsList>
      <HostTabs.TabsContent value="overview">Overview content</HostTabs.TabsContent>
    </HostTabs.Tabs>
  )

  expect(html).toContain('data-orientation="vertical"')
  expect(html).not.toContain('data-orientation="horizontal"')
})

test('shared Slider preserves custom content inside the control', () => {
  const html = renderToStaticMarkup(
    <HostSlider.Slider value={[2]} max={5}>
      <span data-slot="slider-marks">Effort marks</span>
    </HostSlider.Slider>
  )

  expect(html).toContain('data-slot="slider-marks"')
  expect(html).toContain('Effort marks')
  expect(html.indexOf('data-slot="slider-marks"')).toBeGreaterThan(
    html.indexOf('data-slot="slider-track"')
  )
  expect(html.indexOf('data-slot="slider-marks"')).toBeLessThan(
    html.indexOf('data-slot="slider-thumb"')
  )
})

test('shared Slider uses array values for thumb count and otherwise renders one thumb', () => {
  for (const props of [
    { value: 2 },
    { defaultValue: 65 },
    { min: 10 },
    {},
    { value: [2] },
    { defaultValue: [2] },
    { value: [2], defaultValue: [1, 3] }
  ]) {
    const html = renderToStaticMarkup(<HostSlider.Slider {...props} />)
    expect(html.match(/data-slot="slider-thumb"/g)).toHaveLength(1)
  }

  for (const props of [
    { value: [1, 3] },
    { defaultValue: [1, 3] },
    { value: 0, defaultValue: [1, 3] }
  ]) {
    const html = renderToStaticMarkup(<HostSlider.Slider {...props} />)
    expect(html.match(/data-slot="slider-thumb"/g)).toHaveLength(2)
  }
})

test('shared Spinner keeps its accessible label and accepts icon props', () => {
  const html = renderToStaticMarkup(<HostSpinner.Spinner aria-label="Saving" stroke={1.5} />)

  expect(html).toContain('role="status"')
  expect(html).toContain('aria-label="Saving"')
  expect(html).toContain('stroke-width="1.5"')
})

test('shared Popover forwards keepMounted to the portal', () => {
  const portal = HostPopover.PopoverContent({
    keepMounted: true,
    children: 'Popover content'
  })
  const positioner = portal.props.children
  const popup = positioner.props.children

  expect(portal.props.keepMounted).toBe(true)
  expect(popup.props.children).toBe('Popover content')
  expect(popup.props).not.toHaveProperty('keepMounted')
})
