import { CONSENT_VERSION } from '../../lib/supabase'

/** Plain-language consent text (RA 10173). PLACEHOLDER wording: confirm with the data protection officer. */
export function PrivacyNotice() {
  return (
    <details className="notice">
      <summary>Privacy notice (version {CONSENT_VERSION})</summary>
      <p>
        <strong>Purpose.</strong> Your data is used only to check your eligibility for, and to select beneficiaries of, the
        City of Mandaluyong scholarship program for RTU students (Mandaluyong Educational Service Office).
      </p>
      <p>
        <strong>What we collect.</strong> The details on the office&rsquo;s online application and Scholar / Grantee Information
        Sheet: your name, student number, sex, birth date, height and weight, contact details, senior high school, course and
        grades, home address and map location, parents&rsquo; details, siblings, education history, three references, household
        members, household income and living conditions, and the documents you upload (registration form, grades, barangay
        certificate, voter certificate, ITR or certificate of indigency, handwritten statement). Your sex, height and weight
        are kept because the office&rsquo;s form asks for them; they are never used to rank you. We do not ask for your religion.
      </p>
      <p>
        <strong>How it is used.</strong> The system checks your documents, estimates household need, and ranks eligible
        applicants by published criteria. It only <em>recommends</em>: office staff make the final decision, and you may ask
        why you were or were not selected.
      </p>
      <p>
        <strong>Who processes it.</strong> Educational Service Office staff, and service providers that host the system (Supabase for the
        database and files, and a document-reading service). Documents are opened only through short-lived links.
      </p>
      <p>
        <strong>Retention.</strong> Documents are deleted after the retention period set by the office; only anonymized
        statistics are kept.
      </p>
      <p>
        <strong>Your rights.</strong> Under the Data Privacy Act of 2012 you may access, correct, object to and request
        deletion of your data. Contact the city's data protection officer.
      </p>
    </details>
  )
}
