'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var MersenneTwister = _interopDefault(require('mersennetwister'));

/** This class implements a data structure with constant-time insertion, deletion, and random
    sampling. That's crucial for the CPM metropolis algorithm, which repeatedly needs to sample
    pixels at cell borders. */

// pass in RNG
function DiceSet( mt ) {

	// Use a hash map to check in constant time whether a pixel is at a cell border.
	// 
	// Currently (Mar 6, 2019), it seems that vanilla objects perform BETTER than ES6 maps,
	// at least in nodejs. This is weird given that in vanilla objects, all keys are 
	// converted to strings, which does not happen for Maps
	// 
	this.indices = {}; //new Map() // {}
	//this.indices = {}

	// Use an array for constant time random sampling of pixels at the border of cells.
	this.elements = [];

	// track the number of pixels currently present in the DiceSet.
	this.length = 0;

	this.mt = mt;
}

DiceSet.prototype = {
	insert : function( v ){
		if( this.indices[v] ){
			return
		}
		// Add element to both the hash map and the array.
		//this.indices.set( v, this.length )
		this.indices[v] = this.length;
	
		this.elements.push( v );
		this.length ++; 
	},
	remove : function( v ){
		// Check whether element is present before it can be removed.
		if( !this.indices[v] ){
			return
		}
		/* The hash map gives the index in the array of the value to be removed.
		The value is removed directly from the hash map, but from the array we
		initially remove the last element, which we then substitute for the 
		element that should be removed.*/
		//const i = this.indices.get(v)
		const i = this.indices[v];

		//this.indices.delete(v)
		delete this.indices[v];

		const e = this.elements.pop();
		this.length --;
		if( e == v ){
			return
		}
		this.elements[i] = e;

		//this.indices.set(e,i)
		this.indices[e] = i;
	},
	contains : function( v ){
		//return this.indices.has(v)
		return (v in this.indices)
	},
	sample : function(){
		return this.elements[Math.floor(this.mt.rnd()*this.length)]
	}
};

class Grid {
	constructor( field_size, torus = true ){
		this.extents = field_size;
		this.torus = torus;
		this.X_BITS = 1+Math.floor( Math.log2( this.extents[0] - 1 ) );
		this.Y_BITS = 1+Math.floor( Math.log2( this.extents[1] - 1 ) );
		this.midpoint = this.extents.map( i => Math.round((i-1)/2) );
		this.Y_MASK = (1 << this.Y_BITS)-1;
		this.dy = 1 << this.Y_BITS; // for neighborhoods based on pixel index
	}

	setpixi( i, t ){
		this._pixels[i] = t;
	}
	pixti( i ){
		return this._pixels[i]
	}

	* pixels() {
		for( let i = 0 ; i < this._pixels.length ; i ++ ){
			if( this._pixels[i] != 0 ){
				yield [this.i2p(i),this._pixels[i]];
			}
		}
	}
}

/** A class containing (mostly static) utility functions for dealing with 2D 
 *  and 3D grids. */

class Grid2D extends Grid {
	constructor( field_size, torus=true ){
		super( field_size, torus );
		this.field_size = { x : field_size[0], y : field_size[1] };
		// Check that the grid size is not too big to store pixel ID in 32-bit number,
		// and allow fast conversion of coordinates to unique ID numbers.
		if( this.X_BITS + this.Y_BITS > 32 ){
			throw("Field size too large -- field cannot be represented as 32-bit number")
		}
		// Attributes per pixel:
		// celltype (identity) of the current pixel.
		this._pixels = new Uint16Array(this.p2i(field_size));
	}



	/*	Return array of indices of neighbor pixels of the pixel at 
		index i. The separate 2D and 3D functions are called by
		the wrapper function neighi, depending on this.ndim.

	*/
	neighisimple( i ){
		let p = this.i2p(i);
		let xx = [];
		for( let d = 0 ; d <= 1 ; d ++ ){
			if( p[d] == 0 ){
				if( this.torus[d] ){
					xx[d] = [p[d],this.extents[d]-1,p[d]+1];
				} else {
					xx[d] = [p[d],p[d]+1];
				}
			} else if( p[d] == this.extents[d]-1 ){
				if( this.torus[d] ){
					xx[d] = [p[d],p[d]-1,0];
				} else {
					xx[d] = [p[d],p[d]-1];
				}
			} else {
				xx[d] = [p[d],p[d]-1,p[d]+1];
			}
		}

		let r = [], first=true;
		for( let x of xx[0] ){
			for( let y of xx[1] ){
				if( first ){
					first = false; 
				} else {
					r.push( this.p2i( [x,y] ) );
				}
			}
		}
		return r
	}

	neighi( i ){	
		// normal computation of neighbor indices (top left-middle-right, 
		// left, right, bottom left-middle-right)
		let tl, tm, tr, l, r, bl, bm, br;
		
		tl = i-1-this.dy; tm = i-1; tr = i-1+this.dy;
		l = i-this.dy; r = i+this.dy;
		bl = i+1-this.dy; bm = i+1; br = i+1+this.dy;
		
		// if pixel is part of one of the borders, adjust the 
		// indices accordingly
		let add = NaN; // if torus is false, return NaN for all neighbors that cross
		// the border.
		// 
		// left border
		if( i < this.field_size.y ){
			if( this.torus ){
				add = this.field_size.x * this.dy;
			}
			tl += add; l += add; bl += add; 	
		}
		
		// right border
		if( i >= this.dy*( this.field_size.x - 1 ) ){
			if( this.torus ){
				add = -this.field_size.x * this.dy;
			}
			tr += add; r += add; br += add;
		}

		// top border
		if( i % this.dy == 0 ){
			if( this.torus ){
				add = this.field_size.y;
			}
			tl += add; tm += add; tr += add;	
		}
		
		// bottom border
		if( (i+1-this.field_size.y) % this.dy == 0 ){
			if( this.torus ){
				add = -this.field_size.y;
			}
			bl += add; bm += add; br += add;
		}
		if( !this.torus ){
			return [ tl, l, bl, tm, bm, tr, r, br ].filter( isFinite )
		} else {
			return [ tl, l, bl, tm, bm, tr, r, br ]
		}
	}
	p2i ( p ){
		return ( p[0] << this.Y_BITS ) + p[1]
	}
	i2p ( i ){
		return [i >> this.Y_BITS, i & this.Y_MASK]
	}
}

/** A class containing (mostly static) utility functions for dealing with 2D 
 *  and 3D grids. */

class Grid3D extends Grid {
	constructor( field_size, torus = true ){
		super( field_size, torus );
		this.field_size = { x : field_size[0],
			y : field_size[1],
			z : field_size[2] };
		// Check that the grid size is not too big to store pixel ID in 32-bit number,
		// and allow fast conversion of coordinates to unique ID numbers.
		this.Z_BITS = 1+Math.floor( Math.log2( this.field_size.z - 1 ) );
		if( this.X_BITS + this.Y_BITS + this.Z_BITS > 32 ){
			throw("Field size too large -- field cannot be represented as 32-bit number")
		}
		this.Z_MASK = (1 << this.Z_BITS)-1;
		this.dz = 1 << ( this.Y_BITS + this.Z_BITS );
		this._pixels = new Uint16Array(this.p2i(field_size));
	}
	/* 	Convert pixel coordinates to unique pixel ID numbers and back.
		Depending on this.ndim, the 2D or 3D version will be used by the 
		wrapper functions p2i and i2p. Use binary encoding for speed. */
	p2i( p ){
		return ( p[0] << ( this.Z_BITS + this.Y_BITS ) ) + 
			( p[1] << this.Z_BITS ) + 
			p[2]
	}
	i2p( i ){
		return [i >> (this.Y_BITS + this.Z_BITS), 
			( i >> this.Z_BITS ) & this.Y_MASK, i & this.Z_MASK ]
	}
	neighi( i ){
		let p = this.i2p(i);

		let xx = [];
		for( let d = 0 ; d <= 2 ; d ++ ){
			if( p[d] == 0 ){
				if( this.torus ){
					xx[d] = [p[d],this.extents[d]-1,p[d]+1];
				} else {
					xx[d] = [p[d],p[d]+1];
				}
			} else if( p[d] == this.extents[d]-1 ){
				if( this.torus ){
					xx[d] = [p[d],p[d]-1,0];
				} else {
					xx[d] = [p[d],p[d]-1];
				}
			} else {
				xx[d] = [p[d],p[d]-1,p[d]+1];
			}
		}
		let r = [], first=true;
		for( let x of xx[0] ){
			for( let y of xx[1] ){
				for( let z of xx[2] ){
					if( first ){
						first = false; 
					} else {
						r.push( this.p2i( [x,y,z] ) );
					}
				}
			}
		}
		return r
	}
}

/** The core CPM class. Can be used for two- or 
 * three-dimensional simulations. 
*/

class CPM {
	constructor( field_size, conf ){
		let seed = conf.seed || Math.floor(Math.random()*Number.MAX_SAFE_INTEGER);
		this.mt = new MersenneTwister( seed );
		if( !("torus" in conf) ){
			conf["torus"] = true;
		}

		// Attributes based on input parameters
		this.ndim = field_size.length; // grid dimensions (2 or 3)
		if( this.ndim != 2 && this.ndim != 3 ){
			throw("only 2D and 3D models are implemented!")
		}
		this.conf = conf; // input parameter settings; see documentation.

		// Some functions/attributes depend on ndim:
		if( this.ndim == 2 ){
			this.grid = new Grid2D(field_size,conf.torus);
		} else {
			this.grid = new Grid3D(field_size,conf.torus);
		}
		// Pull up some things from the grid object so we don't have to access it
		// from the outside
		this.midpoint = this.grid.midpoint;
		this.field_size = this.grid.field_size;
		this.cellPixels = this.grid.pixels.bind(this.grid);
		this.pixti = this.grid.pixti.bind(this.grid);
		this.neighi = this.grid.neighi.bind(this.grid);
		this.extents = this.grid.extents;

		// Attributes of the current CPM as a whole:
		this.nNeigh = this.grid.neighi(0).length; 	// neighbors per pixel (depends on ndim)
		this.nr_cells = 0;				// number of cells currently in the grid
		this.time = 0;					// current system time in MCS
	
		// track border pixels for speed (see also the DiceSet data structure)
		this.cellborderpixels = new DiceSet( this.mt );

		// Attributes per cell:
		this.cellvolume = [];			
		this.t2k = [];	// celltype ("kind"). Example: this.t2k[1] is the celltype of cell 1.
		this.t2k[0] = 0;	// Background cell; there is just one cell of this type.

		this.soft_constraints = [];
		this.hard_constraints = [];
		this.post_setpix_listeners = [];
		this.post_mcs_listeners = [];
	}

	* cellBorderPixels() {
		for( let i of this.cellborderpixels.elements ){
			const t = this.pixti(i);
			if( t != 0 ){
				yield [this.grid.i2p(i),t];
			}
		}
	}

	add( t ){
		if( "CONSTRAINT_TYPE" in t ){
			switch( t.CONSTRAINT_TYPE ){
			case "soft": this.soft_constraints.push( t.deltaH.bind(t) );break
			case "hard": this.hard_constraints.push( t.fulfilled.bind(t) ); break
			}
		}
		if( typeof t["postSetpixListener"] === "function" ){
			this.post_setpix_listeners.push( t.postSetpixListener.bind(t) );
		}
		if( typeof t["postMCSListener"] === "function" ){
			this.post_mcs_listeners.push( t.postMCSListener.bind(t) );
		}
		t.CPM = this;
		if( typeof t["postAdd"] === "function" ){
			t.postAdd();
		}
	}

	/* Get celltype/identity (pixt) or cellkind (pixk) of the cell at coordinates p or index i. */
	pixt( p ){
		return this.grid.pixti( this.grid.p2i(p) )
	}

	/* Get volume, or cellkind of the cell with type (identity) t */ 
	getVolume( t ){
		return this.cellvolume[t]
	}
	cellKind( t ){
		return this.t2k[ t ]
	}

	/* Assign the cell with type (identity) t to kind k.*/
	setCellKind( t, k ){
		this.t2k[ t ] = k;
	}
	
	/* ------------- MATH HELPER FUNCTIONS --------------- */
	random (){
		return this.mt.rnd()
	}
	/* Random integer number between incl_min and incl_max */
	ran (incl_min, incl_max) {
		return Math.floor(this.random() * (1.0 + incl_max - incl_min)) + incl_min
	}
	
	/* ------------- COMPUTING THE HAMILTONIAN --------------- */


	/* ======= ADHESION ======= */

	// returns both change in hamiltonian and perimeter
	deltaH ( sourcei, targeti, src_type, tgt_type ){
		let r = 0.0;
		for( let t of this.soft_constraints ){
			r += t( sourcei, targeti, src_type, tgt_type );
		}
		return r
	}
	/* ------------- COPY ATTEMPTS --------------- */

	/* 	Simulate one MCS (a number of copy attempts depending on grid size):
		1) Randomly sample one of the border pixels for the copy attempt.
		2) Compute the change in Hamiltonian for the suggested copy attempt.
		3) With a probability depending on this change, decline or accept the 
		   copy attempt and update the grid accordingly. 
	*/
	
	monteCarloStep (){
		let delta_t = 0.0;
		// this loop tracks the number of copy attempts until one MCS is completed.
		while( delta_t < 1.0 ){

			// This is the expected time (in MCS) you would expect it to take to
			// randomly draw another border pixel.
			delta_t += 1./(this.cellborderpixels.length);

			// sample a random pixel that borders at least 1 cell of another type
			const src_i = this.cellborderpixels.sample();
		
			const N = this.grid.neighi( src_i );
			const tgt_i = N[this.ran(0,N.length-1)];
		
			const src_type = this.grid.pixti( src_i );
			const tgt_type = this.grid.pixti( tgt_i );


			// only compute the Hamiltonian if source and target belong to a different cell,
			// and do not allow a copy attempt into the stroma. Only continue if the copy attempt
			// would result in a viable cell.
			if( tgt_type >= 0 && src_type != tgt_type ){
				let ok = true;
				for( let h of this.hard_constraints ){
					if( !h( src_i, tgt_i, src_type, tgt_type ) ){
						ok = false; break
					}
				}
				if( ok ){
					const hamiltonian = this.deltaH( src_i, tgt_i, src_type, tgt_type );
					// probabilistic success of copy attempt 
					if( this.docopy( hamiltonian ) ){
						this.setpixi( tgt_i, src_type );
					}
				}
			}
		}
		this.time++; // update time with one MCS.
		for( let l of this.post_mcs_listeners ){
			l();
		}
	}	

	/* Determine whether copy attempt will succeed depending on deltaH (stochastic). */
	docopy ( deltaH ){
		if( deltaH < 0 ) return true
		return this.random() < Math.exp( -deltaH / this.conf.T )
	}
	/* Change the pixel at position p (coordinates) into cellid t. 
	Update cell perimeters with Pup (optional parameter).*/
	setpixi ( i, t ){		
		const t_old = this.grid.pixti(i);
		if( t_old > 0 ){
			// also update volume of the old cell
			// (unless it is background/stroma)
			this.cellvolume[t_old] --;
			
			// if this was the last pixel belonging to this cell, 
			// remove the cell altogether.
			if( this.cellvolume[t_old] == 0 ){
				delete this.cellvolume[t_old];
				delete this.t2k[t_old];
			}
		}
		// update volume of the new cell and cellid of the pixel.
		this.grid.setpixi(i,t);
		if( t > 0 ){
			this.cellvolume[t] ++;
		}
		this.updateborderneari( i, t_old, t );
		for( let l of this.post_setpix_listeners ){
			l( i, t_old, t );
		}
	}
	setpix ( p, t ){
		this.setpixi( this.grid.p2i(p), t );
	}

	/* Update border elements after a successful copy attempt. */
	updateborderneari ( i, t_old, t_new ){
		if( t_old == t_new ) return
		
		// neighborhood + pixel itself (in indices)
		const Ni = this.grid.neighi(i);
		const Ti = Ni.map( j => this.grid.pixti(j) );
	
		// first deal with i itself
		let isborder = false, wasborder = false;
		for( let k of Ti ){
			if( k != t_new ){
				isborder = true; if(wasborder) break
			}
			if( k != t_old ){
				wasborder = true; if(isborder) break
			}
		}
		if( isborder ){
			if( !wasborder ){
				this.cellborderpixels.insert( i );
			}
		} else if( wasborder ) {
			this.cellborderpixels.remove( i );
		}

		
		// then deal with i's neighbours
		for( let j = 0 ; j < Ni.length ; j ++ ){
			const i2 = Ni[j];
			const t = Ti[j];
			// different type from new pixel -> 
			// must be a border now, no need to check further
			if( t != t_new ){
				// must have already been a border, unless 
				// it had the same pixel type
				if( t == t_old ){
					let wasborder = false;
					const N = this.grid.neighi( i2 );
					for( let k = 0 ; k < N.length ; k ++ ){
						if( (N[k] != i) && (this.grid.pixti( N[k] ) != t) ){
							wasborder = true; break
						}
					}
					if( !wasborder ){
						this.cellborderpixels.insert( i2 );
					}
				}
			} else {
				// same type as new pixel, 
				// so must have been a border pixel before
				// (because t_new != t_old).
				// check if still a border, if not remove
				let isborder = false;
				const N = this.grid.neighi( i2 );
				for( let k = 0 ; k < N.length ; k ++ ){
					if( this.grid.pixti( N[k] ) != t ){
						isborder = true; break
					}
				}
				if( !isborder ){
					this.cellborderpixels.remove( i2 );
				}
			}	
		}
	}

	/* ------------- MANIPULATING CELLS ON THE GRID --------------- */

	/* Initiate a new cellid for a cell of celltype "kind", and create elements
	   for this cell in the relevant arrays (cellvolume, cellperimeter, t2k).*/
	makeNewCellID ( kind ){
		const newid = ++ this.nr_cells;
		this.cellvolume[newid] = 0;
		this.setCellKind( newid, kind );
		return newid
	}

}

/** Class for taking a CPM grid and displaying it in either browser or with nodejs. */

// Constructor takes a CPM object C
function Canvas( C, options ){
	this.C = C;
	this.zoom = (options && options.zoom) || 1;

	this.wrap = (options && options.wrap) || [0,0,0];
	this.width = this.wrap[0];
	this.height = this.wrap[1];

	if( this.width == 0 || this.C.field_size.x < this.width ){
		this.width = this.C.field_size.x;
	}
	if( this.height == 0 || this.C.field_size.y < this.height ){
		this.height = this.C.field_size.y;
	}

	if( typeof document !== "undefined" ){
		this.el = document.createElement("canvas");
		this.el.width = this.width*this.zoom;
		this.el.height = this.height*this.zoom;//C.field_size.y*this.zoom
		var parent_element = (options && options.parentElement) || document.body;
		parent_element.appendChild( this.el );
	} else {
		const {createCanvas} = require("canvas");
		this.el = createCanvas( this.width*this.zoom,
			this.height*this.zoom );
		this.fs = require("fs");
	}

	this.ctx = this.el.getContext("2d");
	this.ctx.lineWidth = .2;
	this.ctx.lineCap="butt";
}


Canvas.prototype = {


	/* Several internal helper functions (used by drawing functions below) : */
	pxf : function( p ){
		this.ctx.fillRect( this.zoom*p[0], this.zoom*p[1], this.zoom, this.zoom );
	},
	pxfi : function( p ){
		const dy = this.zoom*this.width;
		const off = (this.zoom*p[1]*dy + this.zoom*p[0])*4;
		for( let i = 0 ; i < this.zoom*4 ; i += 4 ){
			for( let j = 0 ; j < this.zoom*dy*4 ; j += dy*4 ){
				this.px[i+j+off] = this.col_r;
				this.px[i+j+off + 1] = this.col_g;
				this.px[i+j+off + 2] = this.col_b;
				this.px[i+j+off + 3] = 255;
			}
		}
	},
	pxfir : function( p ){
		const dy = this.zoom*this.width;
		const off = (p[1]*dy + p[0])*4;
		this.px[off] = this.col_r;
		this.px[off + 1] = this.col_g;
		this.px[off + 2] = this.col_b;
		this.px[off + 3] = 255;
	},
	getImageData : function(){
		this.image_data = this.ctx.getImageData(0, 0, this.width*this.zoom, this.height*this.zoom);
		this.px = this.image_data.data;
	},
	putImageData : function(){
		this.ctx.putImageData(this.image_data, 0, 0);
	},
	pxfnozoom : function( p ){
		this.ctx.fillRect( this.zoom*p[0], this.zoom*p[1], 1, 1 );
	},
	/* draw a line left (l), right (r), down (d), or up (u) of pixel p */
	pxdrawl : function( p ){
		for( let i = this.zoom*p[1] ; i < this.zoom*(p[1]+1) ; i ++ ){
			this.pxfir( [this.zoom*p[0],i] );
		}
	},
	pxdrawr : function( p ){
		for( let i = this.zoom*p[1] ; i < this.zoom*(p[1]+1) ; i ++ ){
			this.pxfir( [this.zoom*(p[0]+1),i] );
		}
	},
	pxdrawd : function( p ){
		for( let i = this.zoom*p[0] ; i < this.zoom*(p[0]+1) ; i ++ ){
			this.pxfir( [i,this.zoom*(p[1]+1)] );
		}
	},
	pxdrawu : function( p ){
		for( let i = this.zoom*p[0] ; i < this.zoom*(p[0]+1) ; i ++ ){
			this.pxfir( [i,this.zoom*p[1]] );
		}
	},

	/* For easier color naming */
	col : function( hex ){
		this.ctx.fillStyle="#"+hex;
		this.col_r = parseInt( hex.substr(0,2), 16 );
		this.col_g = parseInt( hex.substr(2,2), 16 );
		this.col_b = parseInt( hex.substr(4,2), 16 );
	},
	/* Color the whole grid in color [col] */
	clear : function( col ){
		col = col || "000000";
		this.ctx.fillStyle="#"+col;
		this.ctx.fillRect( 0,0, this.el.width, this.el.height );
	},

	context : function(){
		return this.ctx
	},

	p2pdraw : function( p ){
		var dim;
		for( dim = 0; dim < p.length; dim++ ){
			if( this.wrap[dim] != 0 ){
				p[dim] = p[dim] % this.wrap[dim];
			}
		}
		return p
	},

	/* DRAWING FUNCTIONS ---------------------- */

	/* Use to draw the border of each cell on the grid in the color specified in "col"
	(hex format). This function draws a line around the cell (rather than coloring the
	outer pixels). If [kind] is negative, simply draw all borders. */
	drawCellBorders : function( kind, col ){
		col = col || "000000";
		let pc, pu, pd, pl, pr, pdraw;
		this.col( col );
		this.getImageData();
		// cst contains indices of pixels at the border of cells
		for( let x of this.C.cellBorderPixels() ){
			let p = x[0];
			if( kind < 0 || this.C.cellKind(x[1]) == kind ){
				pdraw = this.p2pdraw( p );

				pc = this.C.pixt( [p[0],p[1]] );
				pr = this.C.pixt( [p[0]+1,p[1]] );
				pl = this.C.pixt( [p[0]-1,p[1]] );		
				pd = this.C.pixt( [p[0],p[1]+1] );
				pu = this.C.pixt( [p[0],p[1]-1] );

				if( pc != pl  ){
					this.pxdrawl( pdraw );
				}
				if( pc != pr ){
					this.pxdrawr( pdraw );
				}
				if( pc != pd ){
					this.pxdrawd( pdraw );
				}
				if( pc != pu ){
					this.pxdrawu( pdraw );
				}
			}

		}
		this.putImageData();
	},
	/* Use to show activity values of the act model using a color gradient, for
	cells in the grid of cellkind "kind". */
	drawActivityValues : function( kind, A ){
		// cst contains the pixel ids of all non-background/non-stroma cells in
		// the grid. 
		let ii, sigma, a;
		// loop over all pixels belonging to non-background, non-stroma
		this.col("FF0000");
		this.getImageData();
		this.col_b = 0;
		//this.col_g = 0
		for( let x of this.C.cellPixels() ){
			ii = x[0];
			sigma = x[1];

			// For all pixels that belong to the current kind, compute
			// color based on activity values, convert to hex, and draw.
			if( this.C.cellKind(sigma) == kind ){
				a = A.pxact( this.C.grid.p2i( ii ) )/A.conf["MAX_ACT"][kind];
				if( a > 0 ){
					if( a > 0.5 ){
						this.col_r = 255;
						this.col_g = (2-2*a)*255;
					} else {
						this.col_r = (2*a)*255;
						this.col_g = 255;
					}
					this.pxfi( ii );
				}
			}
		}
		this.putImageData();
	},

	/* colors outer pixels of each cell */
	drawOnCellBorders : function( col ){
		col = col || "000000";
		this.getImageData();
		this.col( col );
		for( let i of this.C.cellBorderPixels() ){
			this.pxfi( i[0] );
		}
		this.putImageData();
	},

	/* Draw all cells of cellkind "kind" in color col (hex). col can also be a function that
	 * returns a hex value for a cell id. */
	drawCells : function( kind, col ){
		if( ! col ){
			col = "000000";
		}
		if( typeof col == "string" ){
			this.col(col);
		}
		// Object cst contains pixel index of all pixels belonging to non-background,
		// non-stroma cells.
		let cellpixelsbyid = {};
		for( let x of this.C.cellPixels() ){
			if( kind < 0 || this.C.cellKind(x[1]) == kind ){
				if( !cellpixelsbyid[x[1]] ){
					cellpixelsbyid[x[1]] = [];
				}
				cellpixelsbyid[x[1]].push( x[0] );
			}
		}
		this.getImageData();
		for( let cid of Object.keys( cellpixelsbyid ) ){
			if( typeof col == "function" ){
				this.col( col(cid) );
			}
			for( let cp of cellpixelsbyid[cid] ){
				this.pxfi( cp );
			}
		}
		this.putImageData();
	},

	/* Draw grid to the png file "fname". */
	writePNG : function( fname ){
		this.fs.writeFileSync(fname, this.el.toBuffer());
	}
};

/** Class for outputting various statistics from a CPM simulation, as for instance
    the centroids of all cells (which is actually the only thing that's implemented
    so far) */

function Stats( C ){
	this.C = C;
	this.ndim = this.C.ndim;
}

Stats.prototype = {

	// ------------  FRC NETWORK 

	// for simulation on FRC network. Returns all cells that are in contact with
	// a stroma cell.
	cellsOnNetwork : function(){
		var px = this.C.cellborderpixels.elements, i,j, N, r = {}, t;
		for( i = 0 ; i < px.length ; i ++ ){
			t = this.C.pixti( px[i] );
			if( r[t] ) continue
			N = this.C.neighi(  px[i] );
			for( j = 0 ; j < N.length ; j ++ ){
				if( this.C.pixti( N[j] ) < 0 ){
					r[t]=1; break
				}
			}
		}
		return r
	},
	
	
	// ------------  CELL LENGTH IN ONE DIMENSION
	// (this does not work with a grid torus).
		
	// For computing mean and variance with online algorithm
	updateOnline : function( aggregate, value ){
		
		var delta, delta2;

		aggregate.count ++;
		delta = value - aggregate.mean;
		aggregate.mean += delta/aggregate.count;
		delta2 = value - aggregate.mean;
		aggregate.sqd += delta*delta2;

		return aggregate
	},
	newOnline : function(){
		return( { count : 0, mean : 0, sqd : 0 } ) 
	},
	// return mean and variance of coordinates in a given dimension for cell t
	// (dimension as 0,1, or 2)
	cellStats : function( t, dim ){

		var aggregate, cpt, j, stats;

		// the cellpixels object can be given as the third argument
		if( arguments.length == 3){
			cpt = arguments[2][t];
		} else {
			cpt = this.cellpixels()[t];
		}

		// compute using online algorithm
		aggregate = this.newOnline();

		// loop over pixels to update the aggregate
		for( j = 0; j < cpt.length; j++ ){
			aggregate = this.updateOnline( aggregate, cpt[j][dim] );
		}

		// get mean and variance
		stats = { mean : aggregate.mean, variance : aggregate.sqd / ( aggregate.count - 1 ) };
		return stats
	},
	// get the length (variance) of cell in a given dimension
	// does not work with torus!
	getLengthOf : function( t, dim ){
		
		// get mean and sd in x direction
		var stats = this.cellStats( t, dim );
		return stats.variance

	},
	// get the range of coordinates in dim for cell t
	// does not work with torus!
	getRangeOf : function( t, dim ){

		var minc, maxc, cpt, j;

		// the cellpixels object can be given as the third argument
		if( arguments.length == 3){
			cpt = arguments[2][t];
		} else {
			cpt = this.cellpixels()[t];
		}

		// loop over pixels to find min and max
		minc = cpt[0][dim];
		maxc = cpt[0][dim];
		for( j = 1; j < cpt.length; j++ ){
			if( cpt[j][dim] < minc ) minc = cpt[j][dim];
			if( cpt[j][dim] > maxc ) maxc = cpt[j][dim];
		}
		
		return( maxc - minc )		

	},
	
	// ------------  CONNECTEDNESS OF CELLS
	// ( compatible with torus )
	
	// Compute connected components of the cell ( to check connectivity )
	getConnectedComponentOfCell : function( t, cellindices ){
		if( cellindices.length == 0 ){ return }

		var visited = {}, k=1, volume = {}, myself = this;

		var labelComponent = function(seed, k){
			var q = [parseInt(seed)];
			visited[q[0]] = 1;
			volume[k] = 0;
			while( q.length > 0 ){
				var e = parseInt(q.pop());
				volume[k] ++;
				var ne = myself.C.neighi( e );
				for( var i = 0 ; i < ne.length ; i ++ ){
					if( myself.C.pixti( ne[i] ) == t &&
						!visited.hasOwnProperty(ne[i]) ){
						q.push(ne[i]);
						visited[ne[i]]=1;
					}
				}
			}
		};

		for( var i = 0 ; i < cellindices.length ; i ++ ){
			if( !visited.hasOwnProperty( cellindices[i] ) ){
				labelComponent( cellindices[i], k );
				k++;
			}
		}

		return volume
	},
	getConnectedComponents : function(){
	
		let cpi;
	
		if( arguments.length == 1 ){
			cpi = arguments[0];
		} else {
			cpi = this.cellpixelsi();
		}

		const tx = Object.keys( cpi );
		let i, volumes = {};
		for( i = 0 ; i < tx.length ; i ++ ){
			volumes[tx[i]] = this.getConnectedComponentOfCell( tx[i], cpi[tx[i]] );
		}
		return volumes
	},	
	
	// Compute probabilities that two pixels taken at random come from the same cell.
	getConnectedness : function(){
	
		let cpi;
	
		if( arguments.length == 1 ){
			cpi = arguments[0];
		} else {
			cpi = this.cellpixelsi();
		}
	
		const v = this.getConnectedComponents( cpi );
		let s = {}, r = {}, i, j;
		for( i in v ){
			s[i] = 0;
			r[i] = 0;
			for( j in v[i] ){
				s[i] += v[i][j];
			}
			for( j in v[i] ){
				r[i] += (v[i][j]/s[i]) * (v[i][j]/s[i]);
			}
		}
		return r
	},	
	
	// ------------  PROTRUSION ANALYSIS: PERCENTAGE ACTIVE / ORDER INDEX 
	// ( compatible with torus )
	
	// Compute percentage of pixels with activity > threshold
	getPercentageActOfCell : function( t, cellindices, threshold ){
		if( cellindices.length == 0 ){ return }
		var i, count = 0;

		for( i = 0 ; i < cellindices.length ; i ++ ){
			if( this.C.pxact( cellindices[i] ) > threshold ){
				count++;
			}
		}
		return 100*(count/cellindices.length)
	
	},
	getPercentageAct : function( threshold ){
	
		let cpi;
	
		if( arguments.length == 2 ){
			cpi = arguments[1];
		} else {
			cpi = this.cellpixelsi();
		}
	
		const tx = Object.keys( cpi );
		let i, activities = {};
		for( i = 0 ; i < tx.length ; i ++ ){
			activities[tx[i]] = this.getPercentageActOfCell( tx[i], cpi[tx[i]], threshold );
		}
		return activities
	
	},
	// Computing an order index of the activity gradients within the cell.
	getGradientAt : function( t, i ){
	
		var gradient = [];
		
		// for computing index of neighbors in x,y,z dimension:
		var diff = [1, this.C.dy, this.C.dz ]; 
		
		var d, neigh1, neigh2, t1, t2, ai = this.C.pxact( i ), terms = 0;
		
		for( d = 0; d < this.C.ndim; d++ ){
			// get the two neighbors and their types
			neigh1 = i - diff[d];
			neigh2 = i + diff[d];
			t1 = this.C.cellpixelstype[ neigh1 ];
			t2 = this.C.cellpixelstype[ neigh2 ];
			
			// start with a zero gradient
			gradient[d] = 0.00;
			
			// we will average the difference with the left and right neighbor only if both
			// belong to the same cell. If only one neighbor belongs to the same cell, we
			// use that difference. If neither belongs to the same cell, the gradient
			// stays zero.
			if( t == t1 ){
				gradient[d] += ( ai - this.C.pxact( neigh1 ) );
				terms++;
			}
			if( t == t2 ){
				gradient[d] += ( this.C.pxact( neigh2 ) - ai );
				terms++;
			}
			if( terms != 0 ){
				gradient[d] = gradient[d] / terms;
			}		
						
		}
		
		return gradient
		
	},
	// compute the norm of a vector (in array form)
	norm : function( v ){
		var i;
		var norm = 0;
		for( i = 0; i < v.length; i++ ){
			norm += v[i]*v[i];
		}
		norm = Math.sqrt( norm );
		return norm
	},
	getOrderIndexOfCell : function( t, cellindices ){
	
		if( cellindices.length == 0 ){ return }
		
		// create an array to store the gradient in. Fill it with zeros for all dimensions.
		var gradientsum = [], d;
		for( d = 0; d < this.C.ndim; d++ ){
			gradientsum.push(0.0);
		}
		
		// now loop over the cellindices and add gi/norm(gi) to the gradientsum for each
		// non-zero local gradient:
		var j;
		for( j = 0; j < cellindices.length; j++ ){
			var g = this.getGradientAt( t, cellindices[j] );
			var gn = this.norm( g );
			// we only consider non-zero gradients for the order index
			if( gn != 0 ){
				for( d = 0; d < this.C.ndim; d++ ){
					gradientsum[d] += 100*g[d]/gn/cellindices.length;
				}
			}
		}
		
		
		// finally, return the norm of this summed vector
		var orderindex = this.norm( gradientsum );
		return orderindex	
	},
	getOrderIndices : function( ){
		var cpi = this.cellborderpixelsi();
		var tx = Object.keys( cpi ), i, orderindices = {};
		for( i = 0 ; i < tx.length ; i ++ ){
			orderindices[tx[i]] = this.getOrderIndexOfCell( tx[i], cpi[tx[i]] );
		}
		return orderindices
	
	},
	
	// ------------  CENTROIDS
	// ( compatible with torus )
	//
	// computation of cell centroid is more complicated when the grid is a torus.
	// We compute connected components of the cell with the option torus = false in
	// the computation of neighbourhoods, which means that pixels crossing the border
	// are not considered neighbours (see CPM.js ). We then compute the total centroid as
	// a weighted average of the centroids of the connected components, which we correct
	// separately if they cross the grid borders. 
	
	// Return connected components of the cell ( to compute centroids )
	returnConnectedComponentOfCell : function( t, cellindices ){
		if( cellindices.length == 0 ){ return }

		var visited = {}, k=1, pixels = {}, myself = this;

		var labelComponent = function(seed, k){
			var q = [parseInt(seed)];
			visited[q[0]] = 1;
			pixels[k] = [];
			while( q.length > 0 ){
				var e = parseInt(q.pop());
				pixels[k].push( myself.C.i2p(e) );
				var ne = myself.C.neighi( e, false );
				for( var i = 0 ; i < ne.length ; i ++ ){
					if( !isNaN( ne[i] ) ){
						if( myself.C.pixti( ne[i] ) == t &&
							!visited.hasOwnProperty(ne[i]) ){
							q.push(ne[i]);
							visited[ne[i]]=1;
						}
					
					}

				}
			}
		};

		for( var i = 0 ; i < cellindices.length ; i ++ ){
			if( !visited.hasOwnProperty( cellindices[i] ) ){
				labelComponent( cellindices[i], k );
				k++;
			}
		}

		return pixels
	},
	// converts an array of pixel coordinates to its centroid
	pixelsToCentroid : function( cellpixels ){
		let cvec, j;

		// fill the array cvec with zeros first
		cvec = Array.apply(null, Array(this.ndim)).map(Number.prototype.valueOf,0);

		// loop over pixels to sum up coordinates
		for( j = 0; j < cellpixels.length; j++ ){
			// loop over coordinates x,y,z
			for( let dim = 0; dim < this.ndim; dim++ ){
				cvec[dim] += cellpixels[j][dim];
			}		
		}

		// divide to get mean
		for( let dim = 0; dim < this.ndim; dim++ ){
			cvec[dim] /= j;
		}

		return cvec
	},

	// computes the centroid of a cell when grid has a torus.
	getCentroidOfCellWithTorus : function( t, cellindices ){
		
		if( cellindices.length == 0 ){ return }
		
		// get the connected components and the pixels in it
		let ccpixels = this.returnConnectedComponentOfCell( t, cellindices );
		
		// centroid of the first component
		let c = Object.keys( ccpixels );
		let centroid0 = this.pixelsToCentroid( ccpixels[ c[0] ] );

		// loop over the connected components to compute a weighted sum of their 
		// centroids.
		let n = 0, 
			centroid = Array.apply(null, Array(this.ndim)).map(Number.prototype.valueOf,0);
		const fs = [ this.C.field_size.x, this.C.field_size.y, this.C.field_size.z ];
		for( let j = 0; j < c.length; j++ ){
		
			let centroidc, nc, d;
			centroidc = this.pixelsToCentroid( ccpixels[ c[j] ] );
			nc = ccpixels[ c[j] ].length;
			n += nc;
			
			// compute weighted sum. 
			for( d = 0; d < this.ndim; d++ ){
			
				// If centroid is more than half the field size away
				// from the first centroid0, it crosses the border, so we 
				// first correct its coordinates.
				if( centroidc[d] - centroid0[d] > fs[d]/2 ){
					centroidc[d] -= fs[d];
				}
				if( centroidc[d] - centroid0[d] < -fs[d]/2 ){
					centroidc[d] += fs[d];
				}
				
				centroid[d] += centroidc[d] * nc;
			}
			
		}
		
		// divide by the total n to get the mean
		let d;
		for( d = 0; d < this.ndim; d++ ){
			centroid[d] /= n;
		}

		return centroid		
	},	
	// center of mass of cell t; cellpixels object can be given as the second argument
	getCentroidOf : function( t ){
		var cvec, cpt;
		if( arguments.length == 2 ){
			cpt = arguments[1];
		} else {
			cpt = this.cellpixelsi();
		}
		
		cvec = this.getCentroidOfCellWithTorus( t, cpt[t] );

		return cvec
	},
	// center of mass (return)
	getCentroids : function(){
		
		let cpi;
	
		if( arguments.length == 1 ){
			cpi = arguments[0];
		} else {
			cpi = this.cellpixelsi();
		}
	
		const tx = Object.keys( cpi );
		let cvec, r = [], current, i;

		// loop over the cells in tx to get their centroids
		for( i = 0; i < tx.length; i++ ){
			cvec = this.getCentroidOf( tx[i], cpi[tx[i]] );

			// output depending on ndim
			current = { id : tx[i], x : cvec[0], y : cvec[1] };
			if( this.ndim == 3 ){
				current["z"] = cvec[2];			
			}
			r.push( current );
		}
		return r
	},
	// center of mass (print to console)
	centroids : function(){
		var cp = this.cellpixelsi();
		var tx = Object.keys( cp );	
		var cvec, i;

		// loop over the cells in tx to get their centroids
		for( i = 0; i < tx.length; i++ ){
			cvec = this.getCentroidOf( tx[i], cp[tx[i]] );

			// eslint-disable-next-line no-console
			console.log( 
				tx[i] + "\t" +
				this.C.time + "\t" +
				this.C.time + "\t" +
				cvec.join("\t")
			);

		}
	},

	// returns a list of all cell ids of the cells that border to "cell" and are of a different type
	// a dictionairy with keys = neighbor cell ids, and 
	// values = number of "cell"-pixels the neighbor cell borders to
	cellNeighborsList : function( cell, cbpi ) {
		if (!cbpi) {
			cbpi = this.cellborderpixelsi()[cell];
		} else {
			cbpi = cbpi[cell];
		}
		let neigh_cell_amountborder = {};
		//loop over border pixels of cell
		for ( let cellpix = 0; cellpix < cbpi.length; cellpix++ ) {
			//get neighbouring pixels of borderpixel of cell
			let neighbours_of_borderpixel_cell = this.C.neighi(cbpi[cellpix]);
			//don't add a pixel in cell more than twice
			//loop over neighbouring pixels and store the parent cell if it is different from
			//cell, add or increment the key corresponding to the neighbor in the dictionairy
			for ( let neighborpix = 0; neighborpix < neighbours_of_borderpixel_cell.length;
				neighborpix ++ ) {
				let cell_id = this.C.pixti(neighbours_of_borderpixel_cell[neighborpix]);
				if (cell_id != cell) {
					neigh_cell_amountborder[cell_id] = neigh_cell_amountborder[cell_id]+1 || 1;
				}
			}
		}
		return neigh_cell_amountborder
	},

	// ------------ HELPER FUNCTIONS
	
	// returns an object with a key for each celltype (identity). 
	// The corresponding value is an array of pixel coordinates per cell.
	cellpixels : function(){
		var cp = {};
		var px = Object.keys( this.C.cellpixelstype ), t, i;
		for( i = 0 ; i < px.length ; i ++ ){
			t = this.C.cellpixelstype[px[i]];
			if( !(t in cp ) ){
				cp[t] = [];
			}
			cp[t].push( this.C.i2p( px[i] ) );
		}
		return cp
	},

	cellpixelsi : function(){
		var cp = {};
		var px = Object.keys( this.C.cellpixelstype ), t, i;
		for( i = 0 ; i < px.length ; i ++ ){
			t = this.C.cellpixelstype[px[i]];
			if( !(t in cp ) ){
				cp[t] = [];
			}
			cp[t].push( px[i] );
		}
		return cp
	},
  
	cellborderpixelsi : function(){
		let cp = {}, t;
		const px = this.C.cellborderpixels.elements;
		for( let i = 0; i < px.length; i++ ){
			t = this.C.cellpixelstype[px[i]];
			if( !(t in cp ) ){
				cp[t] = [];
			}
			cp[t].push( px[i] );
		}
		return cp		
	}

};

/* This class contains methods that should be executed once per monte carlo step.
   Examples are cell division, cell death etc.
 */

function GridManipulator( C ){
	this.C = C;
	this.Cs = new Stats( C );
}

GridManipulator.prototype = {

	/* this.cellpixels is an object with keys for every cell type (identity) in the grid.
	values contain pixel coordinates for all pixels belonging to that cell. */
	prepare: function(){
		this.cellpixels = this.Cs.cellpixels();
	},
	/* Kill a cell by setting its kind to 4 */
	killCell: function( t ){
		//console.log("killing cell "+t)
		/*var cp = this.cellpixels
		for( var j = 0 ; j < cp[t].length ; j ++ ){
			this.C.setpix( cp[t][j], 0 )
		}*/
		this.C.setCellKind( t, 4 );
	},
	/* With a given [probability], kill cells of kind [kind] that have a volume of
	less than [lowerbound] of their target volume. */
	killTooSmallCells : function( kind, probability, lowerbound ){
		var cp = this.cellpixels, C = this.C;
		var ids = Object.keys(cp);

		// Loop over cells in the grid
		for( var i = 0 ;  i < ids.length ; i++ ){
			var t = ids[i];
			var k = C.cellKind(t);
			if( k == kind && ( C.getVolume( t ) < C.conf.V[kind]*lowerbound ) ){
				if( C.random() < probability ){
					this.killCell( t );
				}
			}
		}
	},

	/* Let cell t divide by splitting it along a line perpendicular to
	 * its major axis. */
	divideCell2D : function( id ){
		let cp = this.cellpixels, C = this.C, Cs = this.Cs;
		let bxx = 0, bxy = 0, byy=0,
			com = Cs.getCentroidOf( id ), cx, cy, x2, y2, side, T, D, x0, y0, x1, y1, L2;

		// Loop over the pixels belonging to this cell
		for( var j = 0 ; j < cp[id].length ; j ++ ){
			cx = cp[id][j][0] - com[0]; // x position rel to centroid
			cy = cp[id][j][1] - com[1]; // y position rel to centroid

			// sum of squared distances:
			bxx += cx*cx;
			bxy += cx*cy;
			byy += cy*cy;
		}

		// This code computes a "dividing line", which is perpendicular to the longest
		// axis of the cell.
		if( bxy == 0 ){
			x0 = 0;
			y0 = 0;
			x1 = 1;
			y1 = 0;
		} else {
			T = bxx + byy;
			D = bxx*byy - bxy*bxy;
			//L1 = T/2 + Math.sqrt(T*T/4 - D)
			L2 = T/2 - Math.sqrt(T*T/4 - D);
			x0 = 0;
			y0 = 0;
			x1 = L2 - byy;
			y1 = bxy;
		}

		// create a new ID for the second cell
		var nid = C.makeNewCellID( C.cellKind( id ) );

		// Loop over the pixels belonging to this cell
		//let sidea = 0, sideb = 0
		for( j = 0 ; j < cp[id].length ; j ++ ){
			// coordinates of current cell relative to center of mass
			x2 = cp[id][j][0]-com[0];
			y2 = cp[id][j][1]-com[1];

			// Depending on which side of the dividing line this pixel is,
			// set it to the new type
			side = (x1 - x0)*(y2 - y0) - (x2 - x0)*(y1 - y0);
			if( side > 0 ){
				//sidea ++
				C.setpix( cp[id][j], nid ); 
			}
		}
		//console.log( sidea, sideb )
		return nid
	},

	/* With a given probability, let cells of kind [kind] divide. */
	divideCells2D: function( kind, probability, minvolume=10 ){
		var cp = this.cellpixels, C = this.C;
		var ids = Object.keys(cp);		
		// loop over the cells
		for( var i = 0 ;  i < ids.length ; i++ ){
			var id = ids[i];
			var k = C.cellKind(id); 
			if( k == kind && ( C.getVolume( id ) >= minvolume ) && C.random() < probability ){
				this.divideCell2D( id );
			}
		}
	}
};

/* This extends the CPM from CPM.js with a chemotaxis module. 
Can be used for two- or three-dimensional simulations, but visualization
is currently supported only in 2D. Usable from browser and node.
*/

class CPMChemotaxis extends CPM {

	constructor( ndim, field_size, conf ) {
		// call the parent (CPM) constructor
		super( ndim, field_size, conf );
		// make sure "chemotaxis" is included in list of terms
		if( this.terms.indexOf( "chemotaxis" ) == -1 ){	
			this.terms.push( "chemotaxis" );
		}
	}


	/*  To bias a copy attempt p1->p2 in the direction of target point pt.
		Vector p1 -> p2 is the direction of the copy attempt, 
		Vector p1 -> pt is the preferred direction. Then this function returns the cosine
		of the angle alpha between these two vectors. This cosine is 1 if the angle between
		copy attempt direction and preferred direction is 0 (when directions are the same), 
		-1 if the angle is 180 (when directions are opposite), and 0 when directions are
		perpendicular. */
	pointAttractor ( p1, p2, pt ){
		let r = 0., norm1 = 0, norm2 = 0, d1=0., d2=0.;
		for( let i=0 ; i < p1.length ; i ++ ){
			d1 = pt[i]-p1[i]; d2 = p2[i]-p1[i];
			r += d1 * d2;
			norm1 += d1*d1;
			norm2 += d2*d2;
		}
		if( norm1 == 0 || norm2 == 0 ) return 0
		return r/Math.sqrt(norm1)/Math.sqrt(norm2)
	}
	
	/* To bias a copy attempt p1 -> p2 in the direction of vector 'dir'.
	This implements a linear gradient rather than a radial one as with pointAttractor. */
	linAttractor ( p1, p2, dir ){

		let r = 0., norm1 = 0, norm2 = 0, d1 = 0., d2 = 0.;
		// loops over the coordinates x,y,(z)
		for( let i = 0; i < p1.length ; i++ ){
			// direction of the copy attempt on this coordinate is from p1 to p2
			d1 = p2[i] - p1[i];

			// direction of the gradient
			d2 = dir[i];
			r += d1 * d2; 
			norm1 += d1*d1;
			norm2 += d2*d2;
		}
		return r/Math.sqrt(norm1)/Math.sqrt(norm2)
	}

	/* This computes the gradient based on a given function evaluated at the two target points. */ 
	gridAttractor ( p1, p2, dir ){
		return dir( p2 ) - dir( p1 )
	}
	
	deltaHchemotaxis ( sourcei, targeti, src_type, tgt_type ){
		const gradienttype = this.conf["GRADIENT_TYPE"];
		const gradientvec = this.conf["GRADIENT_DIRECTION"];
		let bias, lambdachem;

		if( gradienttype == "radial" ){
			bias = this.pointAttractor( this.i2p(sourcei), this.i2p(targeti), gradientvec );
		} else if( gradienttype == "linear" ){
			bias = this.linAttractor( this.i2p(sourcei), this.i2p(targeti), gradientvec );
		} else if( gradienttype == "grid" ){
			bias = this.gridAttractor( this.i2p( sourcei ), this.i2p( targeti ), gradientvec );
		} else if( gradienttype == "custom" ){
			bias = gradientvec( this.i2p( sourcei ), this.i2p( targeti ), this );
		} else {
			throw("Unknown GRADIENT_TYPE. Please choose 'linear', 'radial', 'grid', or 'custom'." )
		}

		// if source is non background, lambda chemotaxis is of the source cell.
		// if source is background, use lambda chemotaxis of target cell.
		if( src_type != 0 ){
			lambdachem = this.par("LAMBDA_CHEMOTAXIS",src_type );
		} else {
			lambdachem = this.par("LAMBDA_CHEMOTAXIS",tgt_type );
		}	

		return -bias*lambdachem
	}

}

/* This class contains methods that should be executed once per monte carlo step.
   Examples are cell division, cell death etc.
 */


class GridInitializer {
	constructor( C ){
		this.C = C;
	}
	/* Seed a new cell at a random position. Return 0 if failed, ID of new cell otherwise.
	 * Try a specified number of times, then give up if grid is too full. 
	 * The first cell will always be seeded at the midpoint of the grid. */
	seedCell( kind, max_attempts = 10000 ){
		let p = this.C.midpoint;
		while( this.C.pixt( p ) != 0 && max_attempts-- > 0 ){
			for( let i = 0 ; i < p.length ; i ++ ){
				p[i] = this.C.ran(0,this.C.extents[i]-1);
			}
		}
		if( this.C.pixt(p) != 0 ){
			return 0 // failed
		}
		const newid = this.C.makeNewCellID( kind );
		this.C.setpix( p, newid );
		return newid
	}
	/* Seed a new cell of celltype "kind" onto position "p".*/
	seedCellAt( kind, p ){
		const newid = this.C.makeNewCellID( kind );
		this.C.setpix( p, newid );
		return newid
	}
	seedCellsInCircle( kind, n, center, radius, max_attempts = 10000 ){
		if( !max_attempts ){
			max_attempts = 10*n;
		}
		let C = this.C;
		while( n > 0 ){
			if( --max_attempts == 0 ){
				throw("too many attempts to seed cells!")
			}
			let p = center.map( function(i){ return C.ran(Math.ceil(i-radius),Math.floor(i+radius)) } );
			let d = 0;
			for( let i = 0 ; i < p.length ; i ++ ){
				d += (p[i]-center[i])*(p[i]-center[i]);
			}
			if( d < radius*radius ){
				this.seedCellAt( kind, p );
				n--;
			}
		}
	}
}

class Constraint {
	get CONSTRAINT_TYPE() {
		throw("You need to implement the 'CONSTRAINT_TYPE' getter for this constraint!")
	}
	constructor( conf ){
		this.conf = conf;
	}
	set CPM(C){
		this.C = C;
	}
}

class SoftConstraint extends Constraint {
	get CONSTRAINT_TYPE() {
		return "soft"
	}
	// eslint-disable-next-line no-unused-vars
	deltaH( src_i, tgt_i, src_type, tgt_type ){
		throw("You need to implement the 'deltaH' method for this constraint!")
	}
}

/** 
 * Implements the adhesion constraint of Potts models. 
 */

class Adhesion extends SoftConstraint {
	/*  Get adhesion between two cells with type (identity) t1,t2 from "conf" using "this.par". */
	J( t1, t2 ){
		return this.conf["J"][this.C.cellKind(t1)][this.C.cellKind(t2)]
	}
	/*  Returns the Hamiltonian around pixel p, which has ID (type) tp (surrounding pixels'
	 *  types are queried). This Hamiltonian only contains the neighbor adhesion terms.
	 */
	H( i, tp ){
		let r = 0, tn;
		/* eslint-disable */
		const N = this.C.grid.neighi( i );
		for( let j = 0 ; j < N.length ; j ++ ){
			tn = this.C.pixti( N[j] );
			if( tn != tp ) r += this.J( tn, tp );
		}
		return r
	}
	deltaH( sourcei, targeti, src_type, tgt_type ){
		return this.H( targeti, src_type ) - this.H( targeti, tgt_type )
	}
}

/** 
 * Implements the adhesion constraint of Potts models. 
 */

class VolumeConstraint extends SoftConstraint {
	deltaH( sourcei, targeti, src_type, tgt_type ){
		// volume gain of src cell
		let deltaH = this.volconstraint( 1, src_type ) - 
			this.volconstraint( 0, src_type );
		// volume loss of tgt cell
		deltaH += this.volconstraint( -1, tgt_type ) - 
			this.volconstraint( 0, tgt_type );
		return deltaH
	}
	/* ======= VOLUME ======= */

	/* The volume constraint term of the Hamiltonian for the cell with id t.
	   Use vgain=0 for energy of current volume, vgain=1 for energy if cell gains
	   a pixel, and vgain = -1 for energy if cell loses a pixel. 
	*/
	volconstraint ( vgain, t ){
		const k = this.C.cellKind(t), l = this.conf["LAMBDA_V"][k];
		// the background "cell" has no volume constraint.
		if( t == 0 || l == 0 ) return 0
		const vdiff = this.conf["V"][k] - (this.C.getVolume(t) + vgain);
		return l*vdiff*vdiff
	}
}

class HardConstraint {
	get CONSTRAINT_TYPE() {
		return "hard"
	}
	constructor( conf ){
		this.conf = conf;
	}
	set CPM(C){
		this.C = C;
	}
	// eslint-disable-next-line no-unused-vars
	fulfilled( src_i, tgt_i, src_type, tgt_type ){
		throw("You need to implement the 'fulfilled' method for this constraint!")
	}
}

/** 
 * Forbids that cells exceed or fall below a certain size range. 
 */

class HardVolumeRangeConstraint extends HardConstraint {
	fulfilled( src_i, tgt_i, src_type, tgt_type ){
		// volume gain of src cell
		if( src_type != 0 && this.C.getVolume(src_type) + 1 > 
			this.conf["LAMBDA_VRANGE_MAX"][this.C.cellKind(src_type)] ){
			return false
		}
		// volume loss of tgt cell
		if( tgt_type != 0 && this.C.getVolume(tgt_type) - 1 < 
			this.conf["LAMBDA_VRANGE_MIN"][this.C.cellKind(tgt_type)] ){
			return false
		}
		return true
	}
}

/** 
 * Forbids that cells exceed or fall below a certain size range. 
 */

class HardVolumeRangeConstraint$1 extends HardConstraint {	
	get CONSTRAINT_TYPE() {
		return "none"
	}
	/* eslint-disable */
	setpixListener( i, t_old, t ){
		console.log( i, t_old, t );
	}
	afterMCSListener( ){
		console.log( "the time is now: ", this.C.time );
	}
}

/** 
 * Implements the adhesion constraint of Potts models. 
 */

class PerimeterConstraint extends SoftConstraint {
	constructor( conf ){
		super( conf );
		this.cellperimeters = {};
	}
	determinePerimeter( i, t_old, t_new ){
		if( t_old == t_new ){ return }
		const Ni = this.C.neighi( i );
		let n_new = 0, n_old = 0;
		for( let i = 0 ; i < Ni.length ; i ++  ){
			const nt = this.C.pixti(Ni[i]);
			if( nt != t_new ){
				n_new ++; 
			}
			if( nt != t_old ){
				n_old ++;
			}
			if( nt != 0 ){
				if( nt == t_old ){
					this.cellperimeters[nt] ++;
				}
				if( nt == t_new ){
					this.cellperimeters[nt] --;
				}
			}
		}
		if( t_old != 0 ){
			this.cellperimeters[t_old] -= n_old;
		}
		if( t_new != 0 ){
			if( !(t_new in this.cellperimeters) ){
				this.cellperimeters[t_new] = 0;
			}
			this.cellperimeters[t_new] += n_new;
		}
	}
	postSetpixListener( i, t_old, t ){
		this.determinePerimeter( i, t_old, t );
	}
	deltaH( sourcei, targeti, src_type, tgt_type ){
		if( src_type == tgt_type ){
			return 0
		}
		const ts = this.C.cellKind(src_type);
		const ls = this.conf["LAMBDA_P"][ts];
		const tt = this.C.cellKind(tgt_type);
		const lt = this.conf["LAMBDA_P"][tt];
		if( !(ls>0) && !(lt>0) ){
			return 0
		}
		const Ni = this.C.neighi( targeti );
		let pchange = {};
		pchange[src_type] = 0; pchange[tgt_type] = 0;
		for( let i = 0 ; i < Ni.length ; i ++  ){
			const nt = this.C.pixti(Ni[i]);
			if( nt != src_type ){
				pchange[src_type]++; 
			}
			if( nt != tgt_type ){
				pchange[tgt_type]--;
			}
			if( nt == tgt_type ){
				pchange[nt] ++;
			}
			if( nt == src_type ){
				pchange[nt] --;
			}
		}
		let r = 0.0;
		if( ls > 0 ){
			const pt = this.conf["P"][ts],
				ps = this.cellperimeters[src_type];
			const hnew = (ps+pchange[src_type])-pt,
				hold = ps-pt;
			r += ls*((hnew*hnew)-(hold*hold));
		}
		if( lt > 0 ){
			const pt = this.conf["P"][tt],
				ps = this.cellperimeters[tgt_type];
			const hnew = (ps+pchange[tgt_type])-pt,
				hold = ps-pt;
			r += lt*((hnew*hnew)-(hold*hold));
		}
		// eslint-disable-next-line
		//console.log( r )
		return r
	}
}

/* 
	Implements the activity constraint of Potts models. 
	See also: 
		Niculescu I, Textor J, de Boer RJ (2015) 
 		Crawling and Gliding: A Computational Model for Shape-Driven Cell Migration. 
 		PLoS Comput Biol 11(10): e1004280. 
 		https://doi.org/10.1371/journal.pcbi.1004280
 */

class ActivityConstraint extends SoftConstraint {
	constructor( conf ){
		super( conf );

		this.cellpixelsact = {}; // activity of cellpixels with a non-zero activity
		
		// Wrapper: select function to compute activities based on ACT_MEAN in conf
		if( this.conf.ACT_MEAN == "arithmetic" ){
			this.activityAt = this.activityAtArith;
		} else {
			this.activityAt = this.activityAtGeom;
		}
		
	}
	
	/* ======= ACT MODEL ======= */

	/* Act model : compute local activity values within cell around pixel i.
	 * Depending on settings in conf, this is an arithmetic (activityAtArith)
	 * or geometric (activityAtGeom) mean of the activities of the neighbors
	 * of pixel i.
	 */
	/* Hamiltonian computation */ 
	deltaH ( sourcei, targeti, src_type, tgt_type ){

		let deltaH = 0, maxact, lambdaact;
		const src_kind = this.C.cellKind( src_type );
		const tgt_kind = this.C.cellKind( tgt_type );

		// use parameters for the source cell, unless that is the background.
		// In that case, use parameters of the target cell.
		if( src_type != 0 ){
			maxact = this.conf["MAX_ACT"][src_kind];
			lambdaact = this.conf["LAMBDA_ACT"][src_kind];
		} else {
			// special case: punishment for a copy attempt from background into
			// an active cell. This effectively means that the active cell retracts,
			// which is different from one cell pushing into another (active) cell.
			maxact = this.conf["MAX_ACT"][tgt_kind];
			lambdaact = this.conf["LAMBDA_ACT"][tgt_kind];
		}
		if( maxact == 0 || lambdaact == 0 ){
			return 0
		}

		// compute the Hamiltonian. The activityAt method is a wrapper for either activityAtArith
		// or activityAtGeom, depending on conf (see constructor).	
		deltaH += lambdaact*(this.activityAt( targeti ) - this.activityAt( sourcei ))/maxact;
		return deltaH
	}

	/* Activity mean computation methods for arithmetic/geometric mean.
	The method used by activityAt is defined by conf ( see constructor ).*/
	activityAtArith( i ){
		const t = this.C.pixti( i );
		
		// no activity for background/stroma
		if( t <= 0 ){ return 0 }
		
		// neighborhood pixels
		const N = this.C.neighi(i);
		
		// r activity summed, nN number of neighbors
		// we start with the current pixel. 
		let r = this.pxact(i), nN = 1;
		
		// loop over neighbor pixels
		for( let j = 0 ; j < N.length ; j ++ ){ 
			const tn = this.C.pixti( N[j] ); 
			
			// a neighbor only contributes if it belongs to the same cell
			if( tn == t ){
				r += this.pxact( N[j] );
				nN ++; 
			}
		}

		// average is summed r divided by num neighbors.
		return r/nN
	}
	activityAtGeom ( i ){
		const t = this.C.pixti( i );

		// no activity for background/stroma
		if( t <= 0 ){ return 0 }
		
		//neighborhood pixels
		const N = this.C.neighi( i );
		
		// r activity product, nN number of neighbors.
		// we start with the current pixel.
		let nN = 1, r = this.pxact( i );

		// loop over neighbor pixels
		for( let j = 0 ; j < N.length ; j ++ ){ 
			const tn = this.C.pixti( N[j] ); 

			// a neighbor only contributes if it belongs to the same cell.
			// if it does and has activity 0, the product will also be zero so
			// we can already return.
			if( tn == t ){
				if( this.pxact( N[j] ) == 0 ) return 0
				r *= this.pxact( N[j] );
				nN ++; 
			}
		}
		
		// Geometric mean computation. 
		return Math.pow(r,1/nN)
	}


	/* Current activity (under the Act model) of the pixel with ID i. */
	pxact ( i ){
	
		// If the pixel is not in the cellpixelsact object, it has activity 0.
		if ( this.cellpixelsact[i] == undefined ){
			return 0
		}
		// otherwise, its activity is stored in the object.
		return this.cellpixelsact[i]
		
	}
	
	/* eslint-disable no-unused-vars*/
	postSetpixListener( i, t_old, t ){
	
		// After setting a pixel, it gets the MAX_ACT value of its cellkind.
		const k = this.C.cellKind( t );
		this.cellpixelsact[i] = this.conf["MAX_ACT"][k];
	}
	
	postMCSListener(){
		// iterate over cellpixelsage and decrease all activities by one.
		for( let key in this.cellpixelsact ){
			this.cellpixelsact[ key ] = this.cellpixelsact[ key ] - 1;
			
			// activities that reach zero no longer need to be stored.
			if( this.cellpixelsact[ key ] <= 0 ){
				delete this.cellpixelsact[ key ];
			}
		}
	}


}

exports.CPM = CPM;
exports.CPMChemotaxis = CPMChemotaxis;
exports.Stats = Stats;
exports.Canvas = Canvas;
exports.GridManipulator = GridManipulator;
exports.Grid2D = Grid2D;
exports.Grid3D = Grid3D;
exports.Adhesion = Adhesion;
exports.VolumeConstraint = VolumeConstraint;
exports.GridInitializer = GridInitializer;
exports.HardVolumeRangeConstraint = HardVolumeRangeConstraint;
exports.TestLogger = HardVolumeRangeConstraint$1;
exports.ActivityConstraint = ActivityConstraint;
exports.PerimeterConstraint = PerimeterConstraint;
