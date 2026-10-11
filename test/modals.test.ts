import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Modal Navigation & Trigger Mapping', () => {
  it('Architecture, Air-Gap Diagnostics, and Licensing modals are distinct components', async () => {
    const fs = await import('node:fs/promises');
    
    // Check ArchitectureModal exists and has technical blueprint content
    const archPath = new URL('../src/components/Architecture/ArchitectureModal.tsx', import.meta.url);
    const archContent = await fs.readFile(archPath, 'utf-8');
    assert.ok(archContent.includes('System Architecture & Technical Blueprint'));
    assert.ok(archContent.includes('Engine Topology'));
    assert.ok(archContent.includes('Air-Gap Security Model'));

    // Check PrivacyInfo exists and has diagnostic audit content
    const privPath = new URL('../src/components/PrivacyInfo.tsx', import.meta.url);
    const privContent = await fs.readFile(privPath, 'utf-8');
    assert.ok(privContent.includes('Air-Gap Diagnostic & Verification Dashboard'));
    assert.ok(privContent.includes('Real-Time Egress Traffic Monitor'));

    // Check LicenseModal exists and has Ed25519 cryptographic licensing content
    const licPath = new URL('../src/components/License/LicenseModal.tsx', import.meta.url);
    const licContent = await fs.readFile(licPath, 'utf-8');
    assert.ok(licContent.includes('Offline Cryptographic Licensing & Compliance'));
    assert.ok(licContent.includes('Ed25519'));
  });

  it('Header maps Architecture button to onOpenArchitecture, not onOpenPrivacyInfo', async () => {
    const fs = await import('node:fs/promises');
    const headerPath = new URL('../src/components/Header.tsx', import.meta.url);
    const headerContent = await fs.readFile(headerPath, 'utf-8');

    // Verify onOpenArchitecture prop exists and is invoked
    assert.ok(headerContent.includes('onOpenArchitecture?: () => void;'));
    assert.ok(headerContent.includes('onClick={onOpenArchitecture}'));
    
    // Verify Air-Gap badge still maps to onOpenPrivacyInfo
    assert.ok(headerContent.includes('onClick={onOpenPrivacyInfo}'));
    // Verify License button maps to onOpenLicense
    assert.ok(headerContent.includes('onClick={onOpenLicense}'));
  });

  it('App renders all 3 distinct modals with independent open state handlers', async () => {
    const fs = await import('node:fs/promises');
    const appPath = new URL('../src/App.tsx', import.meta.url);
    const appContent = await fs.readFile(appPath, 'utf-8');

    // Verify state variables
    assert.ok(appContent.includes('const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);'));
    assert.ok(appContent.includes('const [isLicenseOpen, setIsLicenseOpen] = useState(false);'));
    assert.ok(appContent.includes('const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);'));

    // Verify Header props pass all 3 openers
    assert.ok(appContent.includes('onOpenPrivacyInfo={() => setIsPrivacyOpen(true)}'));
    assert.ok(appContent.includes('onOpenLicense={() => setIsLicenseOpen(true)}'));
    assert.ok(appContent.includes('onOpenArchitecture={() => setIsArchitectureOpen(true)}'));

    // Verify footer links clearly map to their respective modals
    assert.ok(appContent.includes('onClick={() => setIsArchitectureOpen(true)}'));
    assert.ok(appContent.includes('onClick={() => setIsPrivacyOpen(true)}'));
    assert.ok(appContent.includes('onClick={() => setIsLicenseOpen(true)}'));

    // Verify all 3 modal elements are rendered
    assert.ok(appContent.includes('<ArchitectureModal'));
    assert.ok(appContent.includes('<PrivacyInfo'));
    assert.ok(appContent.includes('<LicenseModal'));
  });
});
