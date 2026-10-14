import React from 'react';
import mark from '../desktop/assets/brand-mark.svg?raw';

// The exact approved vector inherits the existing theme's icon color.
export function BrandMark({size=24}) {
  return <svg width={size} height={size} viewBox="-32 -32 576 576" fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{__html:mark.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1]}}/>;
}
