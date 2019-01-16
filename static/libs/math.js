function circleIntersectionPoints(x0, y0, r0, x1, y1, r1) {
        var a, dx, dy, d, h, rx, ry;
        var x2, y2;

        /* dx and dy are the vertical and horizontal distances between
         * the circle centers.
         */
        dx = x1 - x0;
        dy = y1 - y0;

        /* Determine the straight-line distance between the centers. */
        d = Math.sqrt((dy*dy) + (dx*dx));

        /* Check for solvability. */
        if (d > (r0 + r1)) {
            /* no solution. circles do not intersect. */
            return false;
        }
        if (d < Math.abs(r0 - r1)) {
            /* no solution. one circle is contained in the other */
            return false;
        }

        /* 'point 2' is the point where the line through the circle
         * intersection points crosses the line between the circle
         * centers.  
         */

        /* Determine the distance from point 0 to point 2. */
        a = ((r0*r0) - (r1*r1) + (d*d)) / (2.0 * d) ;

        /* Determine the coordinates of point 2. */
        x2 = x0 + (dx * a/d);
        y2 = y0 + (dy * a/d);

        /* Determine the distance from point 2 to either of the
         * intersection points.
         */
        h = Math.sqrt((r0*r0) - (a*a));

        /* Now determine the offsets of the intersection points from
         * point 2.
         */
        rx = -dy * (h/d);
        ry = dx * (h/d);

        /* Determine the absolute intersection points. */
        var xi = x2 + rx;
        var xi_prime = x2 - rx;
        var yi = y2 + ry;
        var yi_prime = y2 - ry;

        return [xi, xi_prime, yi, yi_prime];
    }



    var intersect = function (lineA, lineB){
	var x1 = lineA.x1
	var y1 = lineA.y1
	var x2 = lineA.x2
	var y2 = lineA.y2

	var x3 = lineB.x1
	var y3 = lineB.y1
	var x4 = lineB.x2
	var y4 = lineB.y2

	var a1, a2, b1, b2, c1, c2;
	var r1, r2 , r3, r4;
	var denom, offset, num;

	//status 
	// 0 = no intersect
	// 1 = colinear
	// 2 = intersects
	var result = {status: 0, x: 0, y: 0}

	// Compute a1, b1, c1, where line joining points 1 and 2
	// is "a1 x + b1 y + c1 = 0".
	a1 = y2 - y1;
	b1 = x1 - x2;
	c1 = (x2 * y1) - (x1 * y2);

	// Compute r3 and r4.
	r3 = ((a1 * x3) + (b1 * y3) + c1);
	r4 = ((a1 * x4) + (b1 * y4) + c1);

	// Check signs of r3 and r4. If both point 3 and point 4 lie on
	// same side of line 1, the line segments do not intersect.
	if ((r3 != 0) && (r4 != 0) && same_sign(r3, r4)){
		result.status = 0
	return result;
	}

	// Compute a2, b2, c2
	a2 = y4 - y3;
	b2 = x3 - x4;
	c2 = (x4 * y3) - (x3 * y4);

	// Compute r1 and r2
	r1 = (a2 * x1) + (b2 * y1) + c2;
	r2 = (a2 * x2) + (b2 * y2) + c2;

	// Check signs of r1 and r2. If both point 1 and point 2 lie
	// on same side of second line segment, the line segments do
	// not intersect.
	if ((r1 != 0) && (r2 != 0) && (same_sign(r1, r2))){
		result.status = 0
	return result;
	}

	//Line segments intersect: compute intersection point.
	denom = (a1 * b2) - (a2 * b1);

	if (denom == 0) {
		result.status = 1
	return result;
	}

	if (denom < 0){ 
	offset = -denom / 2; 
	} 
	else {
	offset = denom / 2 ;
	}

	// The denom/2 is to get rounding instead of truncating. It
	// is added or subtracted to the numerator, depending upon the
	// sign of the numerator.
	num = (b1 * c2) - (b2 * c1);
	if (num < 0){
	x = (num - offset) / denom;
	} 
	else {
	x = (num + offset) / denom;
	}

	num = (a2 * c1) - (a1 * c2);
	if (num < 0){
	y = ( num - offset) / denom;
	} 
	else {
	y = (num + offset) / denom;
	}

	// lines_intersect
	result.status = 2
	result.x = x;  
	result.y = y;  
	return result;
}


var same_sign = function ( a,  b){
  return (( a * b) >= 0);
}