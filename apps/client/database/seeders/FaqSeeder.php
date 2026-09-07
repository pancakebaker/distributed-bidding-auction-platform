<?php

namespace Database\Seeders;

use App\Contracts\CmsCache;
use App\Models\Faq;
use App\Models\User;
use Illuminate\Database\Seeder;

class FaqSeeder extends Seeder
{
    /**
     * Create the FAQ seeder.
     */
    public function __construct(private readonly CmsCache $cache) {}

    /**
     * Seed deterministic public FAQs for local/demo databases.
     */
    public function run(): void
    {
        $admin = $this->adminUser();
        $faqs = [
            [
                'question' => 'How do I place a bid?',
                'answer' => 'Open an auction, enter your bid amount, and submit it through the client. The bidding service validates and processes the bid.',
                'sort_order' => 10,
            ],
            [
                'question' => 'How do live auction updates work?',
                'answer' => 'The browser subscribes to the live-feed service, which sends real-time auction updates independently of Laravel CMS pages.',
                'sort_order' => 20,
            ],
            [
                'question' => 'What happens when I am outbid?',
                'answer' => 'The live auction view reflects newer accepted bids from the real-time feed. Laravel does not decide bid ordering or winners.',
                'sort_order' => 30,
            ],
            [
                'question' => 'When do auctions close?',
                'answer' => 'Auction timing and settlement remain part of the authoritative auction and bidding services, not the Laravel CMS.',
                'sort_order' => 40,
            ],
            [
                'question' => 'Does refreshing the browser lose auction state?',
                'answer' => 'No. The client reloads the current auction view and reconnects to the authoritative bidding and live-feed services.',
                'sort_order' => 50,
            ],
            [
                'question' => 'Where does support content come from?',
                'answer' => 'Pages and FAQs are managed in the Laravel admin CMS and are separate from bid processing and live auction state.',
                'sort_order' => 60,
            ],
        ];

        foreach ($faqs as $faqData) {
            $faq = Faq::query()->firstOrNew(['question' => $faqData['question']]);
            $faq->fill([
                'answer' => $faqData['answer'],
                'sort_order' => $faqData['sort_order'],
                'is_published' => true,
            ]);
            $faq->forceFill([
                'created_by' => $admin->id,
                'updated_by' => $admin->id,
            ])->save();
        }

        $this->cache->forgetFaqs();
    }

    /**
     * Resolve the deterministic demo administrator used as CMS author.
     */
    private function adminUser(): User
    {
        return User::query()
            ->where('email', env('DEMO_ADMIN_EMAIL', DemoAdminSeeder::DEFAULT_EMAIL))
            ->firstOrFail();
    }
}
