import React from 'react'

export default function Terms() {
  return (
    <div style={{ padding: '60px 20px', maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif', color: '#333', lineHeight: '1.6' }}>
      <h1 style={{ fontSize: 32, marginBottom: 24 }}>Terms of Service</h1>
      <p style={{ marginBottom: 16 }}>Last Updated: {new Date().toLocaleDateString()}</p>
      
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>1. Agreement to Terms</h2>
        <p>By accessing or using BotSeller, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the Service.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>2. Subscriptions</h2>
        <p>Our service is billed on a subscription basis. You will be billed in advance on a recurring and periodic basis. At the end of each Billing Cycle, your Subscription will automatically renew under the exact same conditions unless you cancel it.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>3. Service Usage</h2>
        <p>You agree to comply with all applicable terms and policies when using our AI chat service. We are not responsible for any restrictions placed on your account due to policy violations.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>4. Limitation of Liability</h2>
        <p>In no event shall BotSeller be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>5. Changes</h2>
        <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. What constitutes a material change will be determined at our sole discretion.</p>
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
