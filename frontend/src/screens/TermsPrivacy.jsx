import { StatusBar, TopHeader, InfoBox } from '../components/Shared';

export default function TermsPrivacy() {
  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Terms and Privacy Policy" />

        <InfoBox>
          This is a draft template, not a final legal document. Have a qualified lawyer review and
          customise it for your business before this app is used by real customers.
        </InfoBox>

        <div className="stack">
          <div className="card">
            <h3 style={{ fontSize: 15, marginTop: 0 }}>1. Who we are</h3>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              ClearCall ("we", "us", "our") operates a platform that lets ABN-verified Australian
              employers make identity-verified calls to job seekers, so recipients can tell a genuine
              recruitment call apart from a scam call.
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginTop: 0 }}>2. Information we collect</h3>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              For job seekers: your name, email address and phone number. For employers: your company
              name, Australian Business Number (ABN), work email address, contact name, and details of
              any work profiles you create. For every call made through ClearCall: the job role, call
              type, timestamps, duration, outcome, and the display settings that applied to that call.
              If you submit a report, we also collect the reason and any description you provide.
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginTop: 0 }}>3. How we use it</h3>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              We use this information to verify employer identities against the Australian Business
              Register, to route and log calls, to show job seekers accurate verification screens, to
              investigate reports of suspicious activity, and to keep the platform safe — including
              suspending accounts that receive repeated, substantiated reports.
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginTop: 0 }}>4. Phone number privacy</h3>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              A recruiter's phone number is hidden from the job seeker by default on every ClearCall
              Verified Call and is never included in data sent to the receiving device unless the
              recruiter has explicitly chosen to show it in their Call Display Settings. Recruiters can
              always see their own number in their own call logs.
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginTop: 0 }}>5. Sharing and disclosure</h3>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              We don't sell personal information. We may share information with service providers who
              help us operate the platform (such as email delivery and telephony providers), with the
              Australian Business Register to verify ABNs, and where required by law.
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginTop: 0 }}>6. Your rights</h3>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              You can request access to, correction of, or deletion of your personal information at any
              time by contacting support. Australian users have rights under the Privacy Act 1988 (Cth)
              and the Australian Privacy Principles.
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginTop: 0 }}>7. Acceptable use</h3>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              Employers must provide accurate ABN and work email details and only use ClearCall to
              contact people about genuine job or professional opportunities. Misuse — including
              impersonation, harassment, or misleading job seekers — may result in an account being
              placed under review or suspended.
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginTop: 0 }}>8. Changes to this policy</h3>
            <p className="small muted" style={{ lineHeight: 1.6, marginBottom: 0 }}>
              We may update these terms from time to time. Continued use of ClearCall after changes
              take effect means you accept the updated terms.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
