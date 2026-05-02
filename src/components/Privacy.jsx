import React from 'react'

export default function Privacy() {
  return (
    <div style={{ padding: '60px 20px', maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif', color: '#333', lineHeight: '1.6' }}>
      <h1 style={{ fontSize: 32, marginBottom: 24 }}>Privacy Policy for BotSeller</h1>
      <p style={{ marginBottom: 16 }}>Last Updated: {new Date().toLocaleDateString()}</p>
      
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>1. Introduction</h2>
        <p>BotSeller ("we", "us", or "our") operates the BotSeller platform. This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>2. Information Collection and Use</h2>
        <p>We collect several different types of information for various purposes to provide and improve our Service to you, including:</p>
        <ul>
          <li>Email address</li>
          <li>First name and last name</li>
          <li>Phone number</li>
          <li>Business name and product details</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>3. Chat Data</h2>
        <p>Our platform processes messages sent by your customers through our web chat to provide AI-driven automated responses. We do not sell this data to third parties.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>4. Data Security</h2>
        <p>The security of your data is important to us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>5. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, please contact us by email at support@botseller.co</p>
      </section>

      <button 
        onClick={() => window.history.back()} 
        style={{ padding: '12px 24px', background: '#25D366', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
      >
        Go Back
      </button>
    </div>
  )
}
