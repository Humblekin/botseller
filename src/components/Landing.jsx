import { useState, useEffect, useRef } from 'react';

const Particle = ({ style }) => (
  <div className="particle" style={style} />
);

const HeroChat = () => {
  const ref = useRef(null);
  const [visible, setVisible] = useState([]);

  useEffect(() => {
    const msgs = [
      { from: 'cust', text: 'Do you have wireless earbuds?' },
      { from: 'bot', text: 'Yes! We have 3 options:\n\n1. SoundPods Pro — GH₵ 120\n2. BassKing X1 — GH₵ 85\n3. AirLite Basic — GH₵ 45\n\nWhich one interests you?' },
      { from: 'cust', text: 'The SoundPods Pro looks nice. Can I get a discount for 2?' },
      { from: 'bot', text: 'Absolutely! 2 SoundPods Pro = GH₵ 220 (save GH₵ 20). Want me to reserve them for you?' }
    ];

    msgs.forEach((_, i) => {
      setTimeout(() => setVisible(prev => [...prev, i]), 600 + i * 700);
    });
  }, []);

  const chatMessages = [
    { from: 'cust', text: 'Do you have wireless earbuds?' },
    { from: 'bot', text: 'Yes! We have 3 options:\n\n1. SoundPods Pro — GH₵ 120\n2. BassKing X1 — GH₵ 85\n3. AirLite Basic — GH₵ 45\n\nWhich one interests you?' },
    { from: 'cust', text: 'The SoundPods Pro looks nice. Can I get a discount for 2?' },
    { from: 'bot', text: 'Absolutely! 2 SoundPods Pro = GH₵ 220 (save GH₵ 20). Want me to reserve them for you?' }
  ];

  return (
    <div className="wb" ref={ref}>
      {chatMessages.map((m, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: m.from === 'cust' ? 'flex-start' : 'flex-end',
            opacity: visible.includes(i) ? 1 : 0,
            transform: visible.includes(i) ? 'translateY(0)' : 'translateY(15px)',
            transition: 'all .5s ease'
          }}
        >
          <div className={m.from === 'cust' ? 'cbi' : 'cbo'} style={{ whiteSpace: 'pre-line' }}>
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
};

export default function Landing({ onNavigate }) {
  const [scrollVisible, setScrollVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setScrollVisible(true), 100);
  }, []);

  const scrollToFeatures = () => {
    document.getElementById('landFeat')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="page active">
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30, background: 'rgba(6,13,9,.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--brd)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--ac)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-brands fa-whatsapp" style={{ color: '#000', fontSize: 20 }} />
            </div>
            <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 20 }}>BotSeller</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-g" onClick={() => onNavigate('pgLogin')}>Sign In</button>
            <button className="btn-p" onClick={() => onNavigate('pgSignup')} style={{ padding: '10px 22px' }}>Get Started</button>
          </div>
        </div>
      </nav>

      <header style={{ padding: '140px 32px 80px', textAlign: 'center', maxWidth: 900, margin: '0 auto', position: 'relative' }}>
        <Particle style={{ left: '10%', top: '20%', animationDelay: '0s' }} />
        <Particle style={{ left: '80%', top: '15%', animationDelay: '1s' }} />
        <Particle style={{ left: '30%', top: '60%', animationDelay: '2s' }} />
        <Particle style={{ left: '70%', top: '50%', animationDelay: '3s' }} />
        <Particle style={{ left: '50%', top: '30%', animationDelay: '4s' }} />
        <Particle style={{ left: '20%', top: '70%', animationDelay: '1.5s' }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--acg)', border: '1px solid var(--ac3)', borderRadius: 24, padding: '6px 16px', marginBottom: 28 }}>
          <span className="sd on" />
          <span style={{ fontSize: 13, color: 'var(--ac)', fontWeight: 500 }}>Built for Ghanaian businesses</span>
        </div>

        <h1 style={{ fontSize: 'clamp(36px,6vw,64px)', fontWeight: 700, lineHeight: 1.1, marginBottom: 20 }}>
          Your WhatsApp<br />becomes a <span style={{ color: 'var(--ac)' }}>Sales Machine</span>
        </h1>

        <p style={{ fontSize: 18, color: 'var(--fg2)', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 }}>
          Connect your WhatsApp, upload your products, and let AI handle every customer conversation — automatically closing sales while you sleep.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-p" onClick={() => onNavigate('pgSignup')} style={{ padding: '16px 36px', fontSize: 16 }}>
            Start Free Trial <i className="fa-solid fa-arrow-right" style={{ marginLeft: 8 }} />
          </button>
          <button className="btn-s" onClick={scrollToFeatures} style={{ padding: '16px 36px', fontSize: 16 }}>
            See How It Works
          </button>
        </div>

        <div style={{ maxWidth: 380, margin: '60px auto 0', position: 'relative' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--brd)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div className="wh">
              <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fa-solid fa-store" style={{ fontSize: 14, color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Hakim's Electronics</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>online</div>
              </div>
            </div>
            <HeroChat />
            <div className="wi">
              <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>Type a message...</span>
              <i className="fa-solid fa-microphone" style={{ color: 'rgba(255,255,255,.4)', marginLeft: 'auto' }} />
            </div>
          </div>
        </div>
      </header>

      <section id="landFeat" style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>How BotSeller Works</h2>
          <p style={{ color: 'var(--fg2)', fontSize: 16 }}>Three steps to automate your WhatsApp sales</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          <FeatureCard icon="fa-box-open" title="Upload Your Products" desc="Add products with names, prices, descriptions and photos. The AI learns your entire catalog to sell for you." />
          <FeatureCard icon="fa-brands fa-whatsapp" title="Connect WhatsApp" desc="Link your business WhatsApp number with one click. Your bot starts responding to customers instantly." />
          <FeatureCard icon="fa-robot" title="AI Sells For You" desc="Smart AI answers questions, suggests products, shares images, negotiates prices, and closes deals 24/7." />
        </div>
      </section>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 20 }}>
          <StatCard value="2,400+" label="Messages handled daily" />
          <StatCard value="340+" label="Active businesses" />
          <StatCard value="68%" label="Average conversion lift" />
          <StatCard value="GH₵1.2M" label="Sales generated this month" />
        </div>
      </section>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>Simple Pricing</h2>
          <p style={{ color: 'var(--fg2)', fontSize: 16 }}>Start free. Upgrade when you're ready.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20, maxWidth: 920, margin: '0 auto' }}>
          <PricingCard
            title="Starter"
            price="Free"
            sub="7-day trial"
            features={['50 messages/month', '10 products', 'Basic AI text replies', null]}
            featureLabels={['50 messages/month', '10 products', 'Basic AI text replies', 'No image sending']}
            isPopular={false}
            buttonText="Start Free"
            onButtonClick={() => onNavigate('pgSignup')}
          />
          <PricingCard
            title="Business"
            price={<><span>GH₵ 99</span><span style={{ fontSize: 16, fontWeight: 400, color: 'var(--fg2)' }}>/mo</span></>}
            sub="Billed monthly"
            features={['2,000 messages/month', 'Unlimited products', 'AI sends product images', 'Chat analytics']}
            featureLabels={['2,000 messages/month', 'Unlimited products', 'AI sends product images', 'Chat analytics']}
            isPopular={true}
            buttonText="Get Business Plan"
            onButtonClick={() => onNavigate('pgSignup')}
            buttonClass="btn-p"
          />
          <PricingCard
            title="Enterprise"
            price={<><span>GH₵ 249</span><span style={{ fontSize: 16, fontWeight: 400, color: 'var(--fg2)' }}>/mo</span></>}
            sub="Billed monthly"
            features={['Unlimited messages', 'Unlimited products', 'Advanced AI customization', 'Priority support']}
            featureLabels={['Unlimited messages', 'Unlimited products', 'Advanced AI customization', 'Priority support']}
            isPopular={false}
            buttonText="Contact Sales"
            onButtonClick={() => onNavigate('pgSignup')}
          />
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--brd)', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, background: 'var(--ac)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fa-brands fa-whatsapp" style={{ color: '#000', fontSize: 15 }} />
          </div>
          <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: 16 }}>BotSeller</span>
        </div>
        <p style={{ color: 'var(--fg3)', fontSize: 13, marginBottom: 8 }}>Made for businesses in Ghana and beyond.</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          <button className="btn-g" onClick={() => onNavigate('pgPrivacy')} style={{ fontSize: 11, padding: '4px 8px' }}>Privacy Policy</button>
          <button className="btn-g" onClick={() => onNavigate('pgTerms')} style={{ fontSize: 11, padding: '4px 8px' }}>Terms of Service</button>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  const ref = useRef(null);

  const handleMouseMove = (e) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    ref.current.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  };

  return (
    <div className="card fc" ref={ref} onMouseMove={handleMouseMove}>
      <div style={{ width: 48, height: 48, background: 'var(--acg)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <i className={`fa-solid ${icon}`} style={{ color: 'var(--ac)', fontSize: 20 }} />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: 'var(--fg2)', fontSize: 14, lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--ac)', fontFamily: "'Space Grotesk'" }}>{value}</div>
      <div style={{ color: 'var(--fg2)', fontSize: 14, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function PricingCard({ title, price, sub, features, featureLabels, isPopular, buttonText, onButtonClick, buttonClass = 'btn-s' }) {
  return (
    <div className={`card ${isPopular ? 'ph' : ''}`} style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: isPopular ? 'var(--ac)' : 'var(--fg2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 42, fontWeight: 700, fontFamily: "'Space Grotesk'", marginBottom: 4 }}>{price}</div>
      <div style={{ color: 'var(--fg3)', fontSize: 13, marginBottom: 24 }}>{sub}</div>
      <ul style={{ textAlign: 'left', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {featureLabels.map((label, i) => (
          <li key={i} style={{ fontSize: 14, color: features[i] ? 'var(--fg2)' : 'var(--fg3)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className={`fa-solid ${features[i] ? 'fa-check' : 'fa-xmark'}`} style={{ color: features[i] ? 'var(--ac)' : undefined, fontSize: 12 }} />
            {label}
          </li>
        ))}
      </ul>
      <button className={buttonClass} style={{ width: '100%' }} onClick={onButtonClick}>{buttonText}</button>
    </div>
  );
}
