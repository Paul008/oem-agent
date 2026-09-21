import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),select:vi.fn(),eq:vi.fn(),gte:vi.fn(),order:vi.fn(),limit:vi.fn()}));
vi.mock('cloudflare:workers',()=>({WorkerEntrypoint:class {env:unknown;constructor(_ctx:unknown,env:unknown){this.env=env}}}));
vi.mock('./utils/supabase',()=>({createSupabaseClient:()=>mocks}));
vi.mock('./oem/registry',()=>({oemRegistry:{'gwm-au':{}}}));
import {NewsroomOfferFeed} from './newsroom-offer-feed';
beforeEach(()=>{
 vi.clearAllMocks();for(const name of ['from','select','eq','gte','order'] as const)mocks[name].mockReturnValue(mocks);
 mocks.limit.mockResolvedValue({data:[{id:'candidate',title:'Source candidate'}],error:null});
});
const feed=()=>new NewsroomOfferFeed({} as any,{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only'} as any);
it('reads a bounded fresh active feed using the deployed schema',async()=>{
 const before=Date.now();const result=await feed().getOffers('gwm-au');
 expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining('validity_start,validity_end,validity_raw,'));
 expect(mocks.eq).toHaveBeenCalledWith('oem_id','gwm-au');expect(mocks.eq).toHaveBeenCalledWith('lifecycle_status','active');
 expect(mocks.limit).toHaveBeenCalledWith(100);
 const [field,cutoff]=mocks.gte.mock.calls[0];expect(field).toBe('last_seen_at');expect(Date.parse(cutoff)).toBeGreaterThanOrEqual(before-48*3600000);
 expect(result?.scope).toBe('fresh-active-offer-candidates');expect(result?.offers).toHaveLength(1);
 expect(JSON.stringify(result)).not.toContain('test-only');
});
it('does not query unknown brands',async()=>{expect(await feed().getOffers('unknown')).toBeNull();expect(mocks.from).not.toHaveBeenCalled()});
it('does not return an empty successful feed when the database query fails',async()=>{
 mocks.limit.mockResolvedValue({data:null,error:{message:'private database details'}});
 await expect(feed().getOffers('gwm-au')).rejects.toThrow('OEM offer feed unavailable');
});
