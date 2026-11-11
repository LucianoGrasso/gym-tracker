import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ChipGroup } from './chip-group';

describe('ChipGroup', () => {
  it('marks the selected chip and updates the value on click', async () => {
    const fixture = TestBed.createComponent(ChipGroup);
    fixture.componentRef.setInput('options', [
      { value: '1w', label: '1 sem' },
      { value: '1m', label: '1 mes' },
    ]);
    fixture.componentRef.setInput('value', '1m');
    fixture.componentRef.setInput('label', 'Período');
    await fixture.whenStable();

    const [first, second] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    expect(second.getAttribute('aria-checked')).toBe('true');

    first.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.value()).toBe('1w');
    expect(first.getAttribute('aria-checked')).toBe('true');
  });
});
