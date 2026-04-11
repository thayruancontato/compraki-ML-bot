import { searchProducts, getProductDetails } from './src/server/services/mercadolivre';
import { buildWhatsAppPost } from './src/server/services/post-builder';

async function test() {
  console.log('Searching...');
  const items = await searchProducts('celular test', 1);
  console.log('Items:', items);
  const product = await getProductDetails(items[0].id);
  console.log('Product:', product);
  const postData = { ...items[0], ...product };
  console.log('PostData:', postData);
  const text = buildWhatsAppPost(postData, 'A');
  console.log('Text:', text);
}
test();
