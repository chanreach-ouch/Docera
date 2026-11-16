import { ArrowRight, ArrowRightLeft, Edit3, Layers, Minimize2, Scissors, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const POPULAR_TOOLS = [
  {
    id: 'edit',
    title: 'Edit PDF',
    desc: 'Edit text, images, and more directly in your PDF',
    href: '#tools',
    icon: Edit3,
    bgClass: 'icon-bg-pink',
    color: '#EF4444',
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    desc: 'Reduce PDF file size without losing quality',
    href: '/tools/compress',
    icon: Minimize2,
    bgClass: 'icon-bg-purple',
    color: '#8B5CF6',
  },
  {
    id: 'convert',
    title: 'Convert PDF',
    desc: 'Convert PDF to Word, Excel, PowerPoint, and more',
    href: '/tools/convert',
    icon: ArrowRightLeft,
    bgClass: 'icon-bg-blue',
    color: '#3B82F6',
  },
  {
    id: 'merge',
    title: 'Merge PDF',
    desc: 'Combine multiple PDFs into one file',
    href: '/tools/organize?mode=merge',
    icon: Layers,
    bgClass: 'icon-bg-orange',
    color: '#F97316',
  },
  {
    id: 'split',
    title: 'Split PDF',
    desc: 'Divide a PDF into multiple files',
    href: '/tools/organize?mode=split',
    icon: Scissors,
    bgClass: 'icon-bg-rose',
    color: '#EC4899',
  },
  {
    id: 'protect',
    title: 'Protect PDF',
    desc: 'Add a password and encrypt your PDF',
    href: '/tools/security?mode=protect',
    icon: Shield,
    bgClass: 'icon-bg-green',
    color: '#10B981',
  },
];

export function PopularTools() {
  return (
    <section className="popular-tools-section" aria-label="Popular tools">
      <div className="section-title-row">
        <h2 className="popular-title">Popular tools</h2>
        <a href="#tools" className="view-all-link">
          <span>View all tools</span>
          <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>

      <div className="popular-tools-grid">
        {POPULAR_TOOLS.map(tool => {
          const Icon = tool.icon;
          return (
            <Link key={tool.id} to={tool.href} className="popular-tool-card">
              <div className={`popular-icon-wrapper ${tool.bgClass}`}>
                <Icon size={20} strokeWidth={2} color={tool.color} aria-hidden="true" />
              </div>
              <h3 className="popular-card-title">{tool.title}</h3>
              <p className="popular-card-desc">{tool.desc}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
