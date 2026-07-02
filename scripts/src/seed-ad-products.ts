import { getUncachableStripeClient } from './stripeClient';

const AD_PRODUCTS = [
  { name: 'SaddleUpGuide Ad — Homepage Banner',            placement: 'homepage',      price: 9900  },
  { name: 'SaddleUpGuide Ad — Browse Sidebar',             placement: 'sidebar',       price: 7900  },
  { name: 'SaddleUpGuide Ad — Browse Between Listings',    placement: 'browse_inline', price: 8900  },
  { name: 'SaddleUpGuide Ad — Entry Detail Page',          placement: 'entry_page',    price: 4900  },
  { name: 'SaddleUpGuide Ad — Directory Sponsor Bundle',   placement: 'bundle',        price: 24900 },
];

async function seed() {
  const stripe = await getUncachableStripeClient();

  for (const item of AD_PRODUCTS) {
    const existing = await stripe.products.search({
      query: `name:'${item.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`Already exists: ${item.name}`);
      continue;
    }

    const product = await stripe.products.create({
      name: item.name,
      metadata: { placement: item.placement },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: item.price,
      currency: 'usd',
      recurring: { interval: 'month' },
    });

    console.log(`Created: ${item.name} — $${item.price / 100}/mo (${price.id})`);
  }

  console.log('Done.');
}

seed().catch((err) => { console.error(err); process.exit(1); });
