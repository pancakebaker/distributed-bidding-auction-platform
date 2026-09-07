<?php

namespace Tests\Feature;

use App\Models\Faq;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminFaqsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    public function test_guest_cannot_access_admin_faqs(): void
    {
        $this->get('/admin/faqs')->assertRedirect('/login');
    }

    public function test_authenticated_non_admin_cannot_access_admin_faqs(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/admin/faqs')->assertForbidden();
    }

    public function test_admin_can_list_faqs_with_creator_and_updater_names(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Ada Admin']);
        $updater = User::factory()->admin()->create(['name' => 'Uma Updater']);
        Faq::factory()->published()->create([
            'question' => 'How do I bid?',
            'created_by' => $admin->id,
            'updated_by' => $updater->id,
        ]);

        $response = $this->actingAs($admin)->get('/admin/faqs');
        $response->assertOk();

        $bootstrap = $response->viewData('adminBootstrap');
        $this->assertSame('faqs', $bootstrap['page']);
        $this->assertSame('index', $bootstrap['props']['mode']);
        $this->assertSame('Ada Admin', $bootstrap['props']['faqs'][0]['creator_name']);
        $this->assertSame('Uma Updater', $bootstrap['props']['faqs'][0]['updater_name']);
        $this->assertArrayNotHasKey('password', $bootstrap['props']['faqs'][0]);
        $response->assertDontSee('remember_token');
    }

    public function test_admin_can_open_faq_create_form(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->actingAs($admin)->get('/admin/faqs/create');
        $response->assertOk();

        $bootstrap = $response->viewData('adminBootstrap');
        $this->assertSame('create', $bootstrap['props']['mode']);
        $this->assertSame('POST', $bootstrap['props']['method']);
    }

    public function test_valid_faq_can_be_created_with_server_derived_creator_and_updater(): void
    {
        $admin = User::factory()->admin()->create();
        $otherUser = User::factory()->create();

        $response = $this->actingAs($admin)->post('/admin/faqs', [
            'question' => 'Can I cancel a bid?',
            'answer' => 'Accepted bids are handled by the bidding service.',
            'sort_order' => 5,
            'is_published' => true,
            'created_by' => $otherUser->id,
            'updated_by' => $otherUser->id,
        ]);

        $faq = Faq::query()->where('question', 'Can I cancel a bid?')->firstOrFail();
        $response->assertRedirect(route('admin.faqs.edit', $faq));
        $this->assertSame($admin->id, $faq->created_by);
        $this->assertSame($admin->id, $faq->updated_by);
        $this->assertTrue($faq->is_published);
    }

    public function test_invalid_faq_is_rejected(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->from('/admin/faqs/create')
            ->post('/admin/faqs', [
                'question' => '',
                'answer' => '',
                'sort_order' => -1,
                'is_published' => 'maybe',
            ])
            ->assertRedirect('/admin/faqs/create')
            ->assertSessionHasErrors(['question', 'answer', 'sort_order', 'is_published']);
    }

    public function test_faq_can_be_updated_and_updater_is_server_derived(): void
    {
        $creator = User::factory()->admin()->create();
        $admin = User::factory()->admin()->create();
        $otherUser = User::factory()->create();
        $faq = Faq::factory()->create([
            'question' => 'Original question?',
            'created_by' => $creator->id,
            'updated_by' => $creator->id,
        ]);

        $response = $this->actingAs($admin)->put(route('admin.faqs.update', $faq), [
            'question' => 'Updated question?',
            'answer' => 'Updated answer.',
            'sort_order' => 2,
            'is_published' => true,
            'updated_by' => $otherUser->id,
        ]);

        $response->assertRedirect(route('admin.faqs.edit', $faq));
        $faq->refresh();
        $this->assertSame('Updated question?', $faq->question);
        $this->assertSame($creator->id, $faq->created_by);
        $this->assertSame($admin->id, $faq->updated_by);
    }

    public function test_public_faq_route_shows_published_faqs_only_in_order(): void
    {
        $third = Faq::factory()->published()->create(['question' => 'Third?', 'answer' => 'Third answer.', 'sort_order' => 2]);
        $first = Faq::factory()->published()->create(['question' => 'First?', 'answer' => 'First answer.', 'sort_order' => 1]);
        $second = Faq::factory()->published()->create(['question' => 'Second?', 'answer' => 'Second answer.', 'sort_order' => 1]);
        Faq::factory()->create(['question' => 'Draft?', 'answer' => 'Hidden answer.', 'sort_order' => 0, 'is_published' => false]);

        $response = $this->get('/faq');
        $response->assertOk();

        $faqs = $response->viewData('cmsBootstrap')['props']['faqs'];
        $this->assertSame([$first->id, $second->id, $third->id], array_column($faqs, 'id'));
        $this->assertSame(['First?', 'Second?', 'Third?'], array_column($faqs, 'question'));
        $response->assertDontSee('Hidden answer.');
    }
}
