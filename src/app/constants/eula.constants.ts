
export const EULA_VERSION = '2026-05';

export const EULA_DOC_TITLE = 'End User License Agreement';
export const EULA_DOC_SUBTITLE =
  'Consortium for Biomedical Research and Artificial Intelligence in Neurodegeneration (C-BRAIN) — AI Platform and Tools';

export type EulaBlockKind = 'h2' | 'h3' | 'p' | 'ul';

export interface EulaBlock {
  kind: EulaBlockKind;
  text?: string;
  items?: string[];
}

export const EULA_CONTENT: EulaBlock[] = [
  {
    kind: 'p',
    text:
      'PLEASE READ THIS END USER LICENSE AGREEMENT (“AGREEMENT” OR “EULA”) CAREFULLY BEFORE ACCESSING THE C-BRAIN AI PLATFORM (“C-BRAIN AI PLATFORM” OR “PLATFORM”) OR USING THE C-BRAIN ARTIFICIAL INTELLIGENCE TOOLS (“C-BRAIN AI TOOLS” OR “TOOLS”) HOSTED BY WASHINGTON UNIVERSITY, A MISSOURI NONPROFIT CORPORATION, ACTING ON BEHALF OF THE CONSORTIUM FOR BIOMEDICAL RESEARCH AND ARTIFICIAL INTELLIGENCE IN NEURODEGENERATION (“C-BRAIN”) . BY ACCESSING OR USING THE TOOLS, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY ALL TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE TO THESE TERMS, DO NOT ACCESS OR USE THE TOOLS.',
  },

  { kind: 'h2', text: '1. DEFINITIONS' },
  {
    kind: 'p',
    text:
      '“Tools” refers to the C-BRAIN AI research assistance tools, including but not limited to all agentic AI tools and any unified AI scientist tools made available through the C-BRAIN platform (Washington University’s Research Infrastructure Services, RIS) and NAIRR credits system.',
  },
  {
    kind: 'p',
    text:
      '“User” or “You” means any individual who accesses or uses the Tools, including researchers, students, staff, and any other authorized or unauthorized users.',
  },
  {
    kind: 'p',
    text:
      '“Research Data” means any data, datasets, information, text, documents, manuscripts, grant applications, study protocols, or other content submitted to the Platform or processed by the Tools.',
  },
  {
    kind: 'p',
    text:
      '“Funding Agency” means any federal agency, including the National Institutes of Health (NIH), as well as any private, philanthropic, or industry organization that has provided funding in connection with the Research Data you submit to the Platform.',
  },

  { kind: 'h2', text: '2. AUTHORIZED USE' },
  {
    kind: 'p',
    text:
      'Access to the C-BRAIN AI Tools is granted solely for legitimate research and academic purposes consistent with this Agreement and all applicable laws, regulations, institutional policies, funding agreements, and contractual obligations. You agree to use the Tools only in accordance with the terms set forth herein.',
  },

  { kind: 'h2', text: '3. PROHIBITED USES AND CRITICAL COMPLIANCE OBLIGATIONS' },

  { kind: 'h3', text: '3.1 Prohibition on Use in Peer Review Processes' },
  {
    kind: 'p',
    text:
      'You MUST NOT use the C-BRAIN AI Tools in connection with any peer review or confidential review activity, including:',
  },
  {
    kind: 'ul',
    items: [
      'Reviewing unpublished manuscripts submitted to a scientific journal, conference, or other publication venue, where you have agreed to maintain confidentiality as a peer reviewer;',
      'Reviewing grant applications submitted to the NIH or any other Funding Agency, including study sections, special emphasis panels, or any other review committee activity where you have agreed to maintain confidentiality as a peer reviewer;',
      'Reviewing any other confidential materials provided to you in a fiduciary or reviewer capacity where use of AI tools is prohibited or restricted.',
    ],
  },
  {
    kind: 'p',
    text:
      'The National Institutes of Health (NIH) expressly prohibits reviewers from using AI tools, including large language models, to assist in the review of NIH grant applications. This prohibition applies to the review process in its entirety. Similarly, many scientific journals and publishers explicitly prohibit the use of AI tools in the peer review of manuscripts. You are solely responsible for understanding and complying with all applicable restrictions before submitting any materials to the Platform.',
  },
  {
    kind: 'p',
    text:
      'VIOLATING THIS PROVISION MAY CONSTITUTE A BREACH OF YOUR OBLIGATIONS TO THE NIH, YOUR INSTITUTION, AND/OR THE JOURNAL OR PUBLISHER, AND MAY RESULT IN DISCIPLINARY ACTION, DISQUALIFICATION FROM FUTURE REVIEW ACTIVITIES, OR OTHER CONSEQUENCES. WASHINGTON UNIVERSITY AND ITS AFFILIATED C-BRAIN INSTITUTIONS EXPRESSLY DISCLAIM ANY LIABILITY FOR SUCH VIOLATIONS.',
  },

  {
    kind: 'h3',
    text: '3.2 Compliance with Funding Agency Requirements for AI Use of Research Data',
  },
  {
    kind: 'p',
    text:
      'Before submitting any Research Data to the C-BRAIN Platform and using the C-BRAIN AI Tools, you must ensure that your use of such data in an AI system is permitted under all applicable funding agreements and agency regulations. Specifically:',
  },
  {
    kind: 'ul',
    items: [
      'You must confirm that the use of your Research Data with AI tools is consistent with the terms and conditions of any grant, contract, or cooperative agreement from which the data were generated, including but not limited to NIH grants and contracts.',
      'You must review and comply with the NIH Genomic Data Sharing Policy, the NIH Data Management and Sharing Policy, and any other NIH policies governing the use of NIH-funded research data, to the extent applicable to your data.',
      'If your Research Data were generated under NIH funding, you are responsible for verifying that use of such data with AI tools does not violate the terms of your Notice of Award, any applicable Data Use Agreement (DUA), or NIH policy, including restrictions on secondary use of data.',
      'You must ensure compliance with any additional requirements imposed by other Funding Agencies (e.g., NSF, DOD, private foundations, or industry sponsors) whose funds supported the generation or collection of your Research Data.',
    ],
  },
  {
    kind: 'p',
    text:
      'C-BRAIN does not assume responsibility for determining whether your specific use of Research Data with the Tools is permissible under your funding agreements. That determination is your responsibility.',
  },

  { kind: 'h3', text: '3.3 Compliance with Research Participant Consent Requirements' },
  {
    kind: 'p',
    text:
      'If your Research Data includes or is derived from information collected from human research participants, you must ensure that:',
  },
  {
    kind: 'ul',
    items: [
      'The informed consent obtained from participants expressly permits or can reasonably be interpreted to permit the use of their data with AI tools and/or secondary analysis beyond the original study;',
      'Your use of participant data through the Tools complies with all applicable consent forms, IRB approvals, and federal regulations governing human subjects research, including 45 CFR Part 46 and applicable FDA regulations;',
      'You do not submit to the Platform any data that would violate the privacy rights, consent agreements, or legal protections of research participants.',
    ],
  },
  {
    kind: 'p',
    text:
      'You are responsible for ensuring that participant consent covers AI-assisted analysis. If you are uncertain whether consent covers this use, consult your institution’s IRB or research compliance office before proceeding.',
  },

  { kind: 'h3', text: '3.4 Data Provenance and Rights Verification' },
  {
    kind: 'p',
    text:
      'Prior to submitting Research Data to the Platform, you represent and warrant that:',
  },
  {
    kind: 'ul',
    items: [
      'You have verified the provenance of the data, including its source, the identity of the Funding Agency that supported its generation, and any contractual restrictions attached to it;',
      'You hold the necessary rights, permissions, and authorizations to submit the data to an AI system for the intended purpose;',
      'The data are not subject to data use agreements, material transfer agreements, or other contractual restrictions that prohibit or limit AI-assisted analysis without additional approval.',
    ],
  },

  { kind: 'h3', text: '3.5 Other Prohibited Uses' },
  {
    kind: 'p',
    text:
      'In addition to the restrictions above, you must not use the C-BRAIN AI Tools to:',
  },
  {
    kind: 'ul',
    items: [
      'Process or submit data in violation of any applicable law, regulation, or institutional policy;',
      'Submit proprietary, trade secret, or confidential third-party information without appropriate authorization;',
      'Submit classified, export-controlled, or otherwise restricted government information;',
      'Engage in any activity that infringes upon intellectual property rights or violates any applicable contractual obligations.',
    ],
  },

  { kind: 'h2', text: '4. USER ACKNOWLEDGMENTS AND REPRESENTATIONS' },
  { kind: 'p', text: 'By accessing the Tools, you acknowledge and represent that:' },
  {
    kind: 'ul',
    items: [
      'You have read and understand this Agreement in its entirety.',
      'You have reviewed and are familiar with all applicable NIH policies, institutional policies, and funding agency requirements governing the use of AI tools with research data, to the extent relevant to your work.',
      'You have determined, before each use, whether the specific materials you intend to submit are permissible to use with AI tools under your funding agreements, peer review obligations, consent agreements, and any applicable data use agreements.',
      'You accept full responsibility for any violation of applicable policies or agreements arising from your use of the Tools.',
    ],
  },

  { kind: 'h2', text: '5. DISCLAIMER OF LIABILITY' },
  {
    kind: 'p',
    text:
      'C-BRAIN, Washington University in St. Louis, and all affiliated institutions, investigators, and personnel (collectively, “C-BRAIN Parties”) EXPRESSLY DISCLAIM ANY AND ALL LIABILITY for:',
  },
  {
    kind: 'ul',
    items: [
      'Your violation of NIH regulations, funding agency requirements, journal peer review policies, or any other applicable obligations;',
      'Any breach of data use agreements, consent forms, institutional review board requirements, or other contractual or regulatory obligations arising from your use of the Tools;',
      'Any consequences, penalties, disciplinary actions, or damages resulting from your non-compliant use of the Tools, including but not limited to disqualification from NIH review activities, loss of funding, or institutional sanctions.',
    ],
  },
  {
    kind: 'p',
    text:
      'The C-BRAIN AI Tools are provided to support legitimate research. Responsibility for ensuring that each use complies with all applicable rules, regulations, and agreements rests solely with the User. The C-BRAIN Parties are not liable for any failure by Users to conduct the required pre-use compliance review.',
  },

  { kind: 'h2', text: '6. INDEMNIFICATION' },
  {
    kind: 'p',
    text:
      'You agree to indemnify, defend, and hold harmless the C-BRAIN Parties from and against any claims, liabilities, damages, penalties, fines, costs, or expenses (including reasonable attorneys’ fees) arising out of or related to: (a) your violation of this Agreement; (b) your violation of any applicable law, regulation, or policy; (c) your infringement of any third-party rights; or (d) your use of Research Data in violation of any data use agreement, consent form, funding agreement, or peer review obligation.',
  },

  { kind: 'h2', text: '7. INTELLECTUAL PROPERTY' },
  {
    kind: 'p',
    text:
      'The C-BRAIN AI Tools, including all underlying software, algorithms, models, and documentation, are the intellectual property of Washington University in St. Louis and/or its licensors. Nothing in this Agreement grants you any ownership rights in the Tools. You retain ownership of Research Data you submit, subject to the rights you have granted to your Funding Agency and your institution.',
  },

  { kind: 'h2', text: '8. DATA SECURITY AND CONFIDENTIALITY' },
  {
    kind: 'p',
    text:
      'You agree to use the Tools only with data for which you have verified appropriate authorization, and to take reasonable measures to prevent unauthorized access to or disclosure of any confidential or sensitive information. You are responsible for ensuring that your use of the Tools complies with all applicable data security requirements, including those imposed by your institution, Funding Agency, and applicable law.',
  },

  { kind: 'h2', text: '9. MODIFICATIONS TO THIS AGREEMENT' },
  {
    kind: 'p',
    text:
      'C-BRAIN reserves the right to update or modify this Agreement at any time. Continued use of the Tools following notice of any modification constitutes acceptance of the updated terms. Users are encouraged to review this Agreement periodically.',
  },

  { kind: 'h2', text: '10. GOVERNING LAW' },
  {
    kind: 'p',
    text:
      'This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of law principles.',
  },

  { kind: 'h2', text: '11. CONTACT AND REPORTING' },
  {
    kind: 'p',
    text:
      'If you have questions about whether your intended use complies with this Agreement, or if you become aware of a potential violation, please contact the C-BRAIN administrative team before proceeding. For questions about NIH data use policies, consult the NIH Office of Science Policy at https://osp.od.nih.gov. For institutional compliance guidance, contact your institution’s Office of Research or IRB.',
  },

  { kind: 'h2', text: 'USER ACKNOWLEDGMENT' },
  {
    kind: 'p',
    text:
      'By clicking “I Agree” or by accessing and using the C-BRAIN AI Platform and Tools, you acknowledge that you have read, understood, and agree to be bound by this End User License Agreement, including all obligations related to NIH compliance, data provenance, peer review restrictions, and research participant consent.',
  },
];

export type EulaAckKey = 'agreement' | 'peerReview' | 'dataUse' | 'liability';

export type EulaAcknowledgments = Record<EulaAckKey, boolean>;

export interface EulaAcknowledgment {
  key: EulaAckKey;
  label: string;
}

export const EULA_ACKNOWLEDGMENTS: readonly EulaAcknowledgment[] = [
  {
    key: 'agreement',
    label:
      'I have read and agree to the C-BRAIN AI Platform and Tools End User License Agreement.',
  },
  {
    key: 'peerReview',
    label:
      'I confirm that the data I intend to submit are NOT subject to peer review confidentiality obligations (e.g., I am not reviewing a grant application or unpublished manuscript in my capacity as a reviewer).',
  },
  {
    key: 'dataUse',
    label:
      'I confirm that I have verified my data use is permissible under all applicable funding agreements, data use agreements, and consent forms.',
  },
  {
    key: 'liability',
    label:
      'I understand that Washington University, C-BRAIN and its affiliated institutions are not liable for my failure to comply with applicable policies and agreements.',
  },
];
