# Reconstruction evidence — 2026-11-07

Target: https://www.whatbrandonthinks.com/

Observed public behavior:

- White landing page with blue raised buttons, Brandon avatars, overlapping app/emoji badges, animated chat bubbles, chat-category pills, supported messaging apps, reference-image lightbox, FAQ and footer navigation.
- The live upload funnel uses seven steps. Browser-verified steps: context selection → chat platform → upload. The WhatsApp tutorial has individual/group selection and a sequence of export instructions.
- Selected shipped scripts and public locale data disclose additional routes including chat context, chat language, chat note, account, payment status and report launch. These route candidates do not verify private report behavior.

REA static analysis:

- Subject digest: `25b02ecea385b9ed3e19d95e1481fec648d051505eaafc8c94e7e4e8c041e957` (capture inventory at analysis time).
- Parent Evidence: `ev_83b69b3856b116b3c6e0e62a1a709073c23c6c26a510e47e11349aaa0835d1ee`.
- Summary Evidence: `ev_f8023766f52ce4bd9cee754d04a5af72186da26c054b63504ba40e022a4ed2b6`.
- Selected sources: `1fppudy1y259g.js`, `38lce4bj6cvem.js`; both parsed with no parse failures, 51 findings. Twenty-two inventoried sources were outside this analysis selection. Static relationship coverage is partial. No bootstrap code was executed by REA.
- A REA controlled browser capture failed with an execution/cleanup diagnostic. No successful REA runtime Evidence is claimed. Visual and interaction observations came from the separate CUA browser.

The original site's server logic, model, prompts, accounts, private reports and billing behavior were not observed. This project independently implements local chat analysis, server accounts, queued reports and follow-ups. It does not claim behavioral equivalence with inaccessible original features.

Public research bundles are ignored by Git. They contain third-party minified code and are not used as runtime application code. Reference avatars, icons and reaction images are retained in frontend/public/assets and rendered locally. All reaction imagery is labelled as originating from the reference site.
