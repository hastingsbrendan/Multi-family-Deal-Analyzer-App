import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { iSty } from './ui/InputRow';
import { GMAPS_KEY } from '../lib/constants';;

function AddressAutocomplete({value, onChange, placeholder, inputStyle}) {
  const inputRef = useRef(null);
  const acRef = useRef(null);

  useEffect(() => {
    function initAC() {
      if (!inputRef.current || acRef.current) return;
      if (!window.google?.maps?.places) return;
      acRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address'] });
      acRef.current.addListener('place_changed', () => {
        const place = acRef.current.getPlace();
        if (place?.formatted_address) onChange(place.formatted_address);
      });
    }
    if (window.google?.maps?.places) {
      initAC();
    } else {
      const iv = setInterval(() => { if (window.google?.maps?.places) { initAC(); clearInterval(iv); } }, 200);
      return () => clearInterval(iv);
    }
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}

// ─── PORTFOLIO MAP ────────────────────────────────────────────────────────────

export default AddressAutocomplete;
