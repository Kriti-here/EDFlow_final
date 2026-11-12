import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import Reveal from '../components/Reveal';
import { getNavItem } from '../config/navigation';
import { errorMessage } from '../services/api';
import {
  fetchExporter,
  saveExporter,
  type ExporterInput,
  type ExporterProfile,
} from '../services/exporterService';

const { label, description } = getNavItem('/settings');

/** Form state: the backend accepts null for unset optional text fields. */
type FormState = {
  legal_name: string;
  entity_type: string;
  pan: string;
  gstin: string;
  lut_number: string;
  lut_not_applicable: boolean;
  ad_bank_name: string;
  ad_code: string;
  ie_code: string;
  address: string;
  sac_code: string;
};

const EMPTY_FORM: FormState = {
  legal_name: '',
  entity_type: 'company',
  pan: '',
  gstin: '',
  lut_number: '',
  lut_not_applicable: false,
  ad_bank_name: '',
  ad_code: '',
  ie_code: '',
  address: '',
  sac_code: '',
};

const ENTITY_TYPES = ['company', 'llp', 'partnership', 'proprietorship', 'individual'];

function toForm(profile: ExporterProfile): FormState {
  return {
    legal_name: profile.legal_name ?? '',
    entity_type: profile.entity_type ?? 'company',
    pan: profile.pan ?? '',
    gstin: profile.gstin ?? '',
    lut_number: profile.lut_number ?? '',
    lut_not_applicable: profile.lut_not_applicable ?? false,
    ad_bank_name: profile.ad_bank_name ?? '',
    ad_code: profile.ad_code ?? '',
    ie_code: profile.ie_code ?? '',
    address: profile.address ?? '',
    sac_code: profile.sac_code ?? '',
  };
}

/** Trim a field, converting an empty string to null for the backend. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

const inputClass =
  'w-full rounded-xl bg-surface-container-lowest border border-surface-container-high px-space-sm py-2 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none';
const labelClass = 'font-label-sm text-label-sm text-on-surface-variant';

/** Exporter profile editor backed by GET/PUT /exporter. */
function Settings() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [profile, setProfile] = useState<ExporterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchExporter()
      .then((res) => {
        setProfile(res);
        if (res) setForm(toForm(res));
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update =
    (key: keyof FormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value =
        event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.legal_name.trim()) {
      setError('Legal name is required.');
      return;
    }
    const body: ExporterInput = {
      legal_name: form.legal_name.trim(),
      entity_type: form.entity_type,
      pan: orNull(form.pan),
      gstin: orNull(form.gstin),
      lut_number: orNull(form.lut_number),
      lut_not_applicable: form.lut_not_applicable,
      ad_bank_name: orNull(form.ad_bank_name),
      ad_code: orNull(form.ad_code),
      ie_code: orNull(form.ie_code),
      address: orNull(form.address),
      sac_code: orNull(form.sac_code),
    };
    setSaving(true);
    setError(null);
    saveExporter(body)
      .then((res) => {
        setProfile(res);
        setForm(toForm(res));
        setSaved(true);
        setSaving(false);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setSaving(false);
      });
  };

  return (
    <div className="flex flex-col w-full">
      <div className="px-space-base pt-space-md pb-space-xs">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
          {label}
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{description}</p>
      </div>

      <div className="flex flex-col gap-space-base px-space-base pb-space-xl">
        {loading ? (
          <Reveal>
            <div className="flex flex-col items-center justify-center py-space-xl gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] animate-spin">sync</span>
              <p className="font-body-md text-body-md">Loading exporter profile…</p>
            </div>
          </Reveal>
        ) : (
          <Reveal>
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl bg-surface-container-lowest shadow-sm p-space-lg flex flex-col gap-space-base"
            >
              <div className="flex items-center justify-between gap-space-sm">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Exporter Identity
                </h2>
                {profile === null ? (
                  <span className="font-label-sm text-label-sm text-amber-700 bg-amber-50 px-space-sm py-0.5 rounded-full">
                    Not set yet
                  </span>
                ) : (
                  <span className="font-label-sm text-label-sm text-emerald-700 bg-emerald-50 px-space-sm py-0.5 rounded-full">
                    Saved
                  </span>
                )}
              </div>

              <p className="font-body-sm text-body-sm text-on-surface-variant">
                These details appear on every export invoice and on the EDF worksheet. They are stored
                on your backend only.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Legal name *</span>
                  <input
                    className={inputClass}
                    value={form.legal_name}
                    onChange={update('legal_name')}
                    placeholder="Acme Exports Pvt Ltd"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Entity type</span>
                  <select className={inputClass} value={form.entity_type} onChange={update('entity_type')}>
                    {ENTITY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>PAN</span>
                  <input className={inputClass} value={form.pan} onChange={update('pan')} placeholder="AAAAA0000A" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>GSTIN</span>
                  <input className={inputClass} value={form.gstin} onChange={update('gstin')} placeholder="22AAAAA0000A1Z5" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>LUT number</span>
                  <input
                    className={inputClass}
                    value={form.lut_number}
                    onChange={update('lut_number')}
                    disabled={form.lut_not_applicable}
                    placeholder="AD2200000000000"
                  />
                </label>
                <label className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-surface-container-high text-primary focus:ring-primary"
                    checked={form.lut_not_applicable}
                    onChange={update('lut_not_applicable')}
                  />
                  <span className={labelClass}>LUT not applicable</span>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>AD bank name</span>
                  <input className={inputClass} value={form.ad_bank_name} onChange={update('ad_bank_name')} placeholder="HDFC Bank" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>AD code</span>
                  <input className={inputClass} value={form.ad_code} onChange={update('ad_code')} placeholder="0512345678901234" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>IE code</span>
                  <input className={inputClass} value={form.ie_code} onChange={update('ie_code')} placeholder="0512345678" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>SAC code</span>
                  <input className={inputClass} value={form.sac_code} onChange={update('sac_code')} placeholder="998314" />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className={labelClass}>Registered address</span>
                <textarea
                  className={`${inputClass} min-h-[80px]`}
                  value={form.address}
                  onChange={update('address')}
                  placeholder="Street, city, state, PIN code"
                />
              </label>

              {error ? (
                <p className="font-body-sm text-body-sm text-error flex items-center gap-1">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  {error}
                </p>
              ) : null}

              <div className="flex items-center gap-space-sm">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-space-base py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {saving ? 'sync' : 'save'}
                  </span>
                  {saving ? 'Saving…' : 'Save profile'}
                </button>
                {saved ? (
                  <span className="font-label-sm text-label-sm text-emerald-700 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    Profile saved.
                  </span>
                ) : null}
              </div>
            </form>
          </Reveal>
        )}
      </div>
    </div>
  );
}

export default Settings;
